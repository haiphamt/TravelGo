<?php

namespace App\Http\Controllers;

use App\Http\Resources\ReviewResource;
use App\Models\Place;
use App\Models\Review;
use App\Models\ReviewPhoto;
use App\Models\User;
use App\Services\ReviewImages;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class ReviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $input = $request->validate([
            'placeId' => ['required', 'string', 'max:80'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);
        $place = Place::query()->where('public_id', $input['placeId'])->firstOrFail();
        $visible = Review::query()->where('place_id', $place->id)->whereNull('hidden_at');
        $summary = (clone $visible)->selectRaw('COUNT(*) AS count, AVG(rating) AS average')->first();
        $page = $visible->with(['user', 'place', 'photos'])->orderByDesc('id')->paginate((int) ($input['per_page'] ?? 10));

        return response()->json([
            'data' => ReviewResource::collection($page->items())->resolve($request),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
            'summary' => ['count' => (int) $summary->count, 'average' => $summary->average === null ? null : round((float) $summary->average, 2)],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function mine(Request $request): JsonResponse
    {
        $input = $request->validate(['placeId' => ['required', 'string', 'max:80']]);
        $place = Place::query()->where('public_id', $input['placeId'])->firstOrFail();
        $review = Review::query()->where('place_id', $place->id)->where('user_id', $request->user()->id)->with(['user', 'place', 'photos'])->first();

        return response()->json(['data' => $review ? (new ReviewResource($review))->withHiddenPhotos()->resolve($request) : null])
            ->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request, ReviewImages $images): JsonResponse
    {
        return $this->save($request, $images);
    }

    public function update(Request $request, ReviewImages $images, Review $review): JsonResponse
    {
        abort_unless($review->user_id === $request->user()->id, 403);

        return $this->save($request, $images, $review);
    }

    private function save(Request $request, ReviewImages $images, ?Review $target = null): JsonResponse
    {
        $input = $request->validate([
            'placeId' => ['required', 'string', 'max:80'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'text' => ['present', 'nullable', 'string', 'max:500'],
            'visitedOn' => ['present', 'nullable', 'date_format:Y-m-d', 'before_or_equal:'.now('Asia/Ho_Chi_Minh')->toDateString()],
            'photos' => ['present', 'array', 'max:3'],
            'photos.*' => ['required', 'string', 'max:6990540'],
            'user_id' => ['prohibited'], 'userId' => ['prohibited'], 'author' => ['prohibited'],
            'hidden_at' => ['prohibited'], 'hidden' => ['prohibited'],
        ]);
        $place = Place::query()->where('public_id', $input['placeId'])->firstOrFail();
        if ($target && $target->place_id !== $place->id) {
            throw ValidationException::withMessages(['placeId' => 'Không thể chuyển đánh giá sang địa điểm khác.']);
        }

        // Validate all new bytes before writing any files or changing the review.
        $photos = [];
        foreach ($input['photos'] as $index => $photo) {
            $photos[] = preg_match('~\A/api/review-photos/([1-9][0-9]*)\z~D', $photo, $match)
                ? ['retain' => $match[1]] : $images->decode($photo, $index);
        }

        $written = [];
        $removed = [];
        try {
            $review = DB::transaction(function () use ($request, $input, $place, $target, $photos, &$written, &$removed) {
                // Serialize saves by the same author, including a first POST with no review row yet.
                User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
                $review = Review::query()->where('user_id', $request->user()->id)->where('place_id', $place->id)->lockForUpdate()->first();
                if ($target) {
                    abort_unless($review && $review->id === $target->id, 404);
                }
                $existing = $review?->photos()->get()->keyBy(fn ($photo) => (string) $photo->id) ?? collect();
                foreach ($photos as $index => $photo) {
                    if (isset($photo['retain']) && ! $existing->has($photo['retain'])) {
                        throw ValidationException::withMessages(['photos.'.$index => 'Chỉ giữ lại ảnh của chính đánh giá này.']);
                    }
                }
                $review ??= new Review(['user_id' => $request->user()->id, 'place_id' => $place->id]);
                $review->fill(['rating' => $input['rating'], 'text' => $input['text'] ?? '', 'visited_on' => $input['visitedOn']]);
                $review->updated_at = now();
                // An author edit does not undo a moderator's hide decision.
                $review->save();
                $kept = [];
                foreach ($photos as $position => $photo) {
                    $matching = isset($photo['sha256']) ? $existing->first(fn ($row) => $row->sha256 === $photo['sha256'] && ! in_array($row->id, $kept, true)) : null;
                    if (isset($photo['retain']) || $matching) {
                        $row = isset($photo['retain']) ? $existing->get($photo['retain']) : $matching;
                        if (in_array($row->id, $kept, true)) {
                            throw ValidationException::withMessages(['photos.'.$position => 'Mỗi ảnh chỉ được gửi một lần.']);
                        }
                        $row->update(['position' => $position]);
                    } else {
                        $path = 'review-photos/'.Str::uuid().'.'.$photo['extension'];
                        if (! Storage::disk('local')->put($path, $photo['bytes'])) {
                            throw new \RuntimeException('Could not store review photo.');
                        }
                        $written[] = $path;
                        $row = $review->photos()->create(['path' => $path, 'mime' => $photo['mime'], 'sha256' => $photo['sha256'], 'position' => $position]);
                    }
                    $kept[] = $row->id;
                }
                foreach ($existing as $photo) {
                    if (! in_array($photo->id, $kept, true)) {
                        $removed[] = $photo->path;
                        $photo->delete();
                    }
                }

                return $review;
            });
        } catch (Throwable $error) {
            Storage::disk('local')->delete($written);
            throw $error;
        }
        Storage::disk('local')->delete($removed);

        return response()->json(['data' => (new ReviewResource($review->load(['user', 'place', 'photos'])))->withHiddenPhotos()->resolve($request)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function destroy(Request $request, Review $review): JsonResponse
    {
        abort_unless($review->user_id === $request->user()->id, 403);
        $paths = DB::transaction(function () use ($request, $review) {
            User::query()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $locked = Review::query()->whereKey($review->id)->lockForUpdate()->firstOrFail();
            $paths = $locked->photos()->pluck('path')->all();
            $locked->delete();

            return $paths;
        });
        Storage::disk('local')->delete($paths);

        return response()->json(['data' => null])->header('Cache-Control', 'private, no-store');
    }

    public function photo(Request $request, ReviewPhoto $photo)
    {
        $review = $photo->review;
        $owner = (string) $request->user()?->id === (string) $review->user_id;
        abort_if(! $owner && ($review->hidden_at !== null || $photo->hidden_at !== null), 404);
        abort_unless(Storage::disk('local')->exists($photo->path), 404);

        return Storage::disk('local')->response($photo->path, null, [
            'Content-Type' => $photo->mime,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ], 'inline');
    }
}
