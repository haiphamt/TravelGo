<?php

namespace App\Http\Controllers;

use App\Models\Contribution;
use App\Models\Favorite;
use App\Models\Place;
use App\Models\Review;
use App\Models\User;
use App\Services\Moderation\ModerationCatalog;
use App\Services\Moderation\ModerationWorkflow;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ModerationController extends Controller
{
    public function __construct(private ModerationWorkflow $workflow, private ModerationCatalog $catalog) {}

    public function session(Request $request): array
    {
        return ['data' => ['id' => (string) $request->user()->id, 'admin' => $this->workflow->isAdmin($request->user())]];
    }

    public function index(Request $request): array
    {
        return $this->listing($request, false);
    }

    public function queue(Request $request): array
    {
        abort_unless($this->workflow->isAdmin($request->user()), 403);

        return $this->listing($request, true);
    }

    public function overview(Request $request): JsonResponse
    {
        abort_unless($this->workflow->isAdmin($request->user()), 403);

        $publicReviews = Review::query()->whereNull('hidden_at');
        $reviewSummary = (clone $publicReviews)
            ->selectRaw('place_id, COUNT(*) AS review_count, AVG(rating) AS rating')
            ->groupBy('place_id');
        $topPlaces = Place::query()
            ->joinSub($reviewSummary, 'summary', 'summary.place_id', '=', 'places.id')
            ->orderByDesc('summary.review_count')
            ->orderByDesc('summary.rating')
            ->orderBy('places.id')
            ->limit(5)
            ->get(['places.public_id', 'places.name', 'places.area', 'summary.review_count', 'summary.rating']);

        return response()->json(['data' => [
            'catalog' => [
                'places' => Place::query()->count(),
                'users' => User::query()->count(),
                'reviews' => $publicReviews->count(),
                'favorites' => Favorite::query()->count(),
            ],
            'topPlaces' => $topPlaces->map(fn (Place $place) => [
                'id' => $place->public_id,
                'name' => $place->name,
                'area' => $place->area,
                'reviewCount' => (int) $place->review_count,
                'rating' => round((float) $place->rating, 2),
            ])->all(),
        ]])->header('Cache-Control', 'no-store, private');
    }

    public function show(Request $request, Contribution $contribution): array
    {
        abort_unless($contribution->user_id === $request->user()->id || $this->workflow->isAdmin($request->user()), 404);

        return ['data' => $this->resource($contribution)];
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->resource($this->workflow->submit($request->user(), $request->all()))], 201);
    }

    public function resubmit(Request $request, Contribution $contribution): array
    {
        abort_unless($contribution->user_id === $request->user()->id, 403);
        $data = $request->validate(['expectedVersion' => ['required', 'integer', 'min:1']]);

        return ['data' => $this->resource($this->workflow->submit($request->user(), $request->all(), $contribution, $data['expectedVersion']))];
    }

    public function withdraw(Request $request, Contribution $contribution): array
    {
        abort_unless($contribution->user_id === $request->user()->id, 403);
        $data = $request->validate(['expectedVersion' => ['required', 'integer', 'min:1']]);

        return ['data' => $this->resource($this->workflow->change($request->user(), $contribution, $data['expectedVersion'], 'withdrawn', 'Người gửi rút yêu cầu.'))];
    }

    public function decide(Request $request, Contribution $contribution): array
    {
        abort_unless($this->workflow->isAdmin($request->user()), 403);
        $data = $request->validate([
            'expectedVersion' => ['required', 'integer', 'min:1'],
            'decision' => ['required', Rule::in(['approved', 'rejected', 'needs-info', 'revoked'])],
            'reason' => ['required', 'string', 'max:600'],
            'reportAction' => ['nullable', Rule::in(['keep', 'hide-photo', 'hide-review'])],
        ]);

        return ['data' => $this->resource($this->workflow->change($request->user(), $contribution, $data['expectedVersion'], $data['decision'], $data['reason'], $data['reportAction'] ?? null))];
    }

    public function place(Request $request): array
    {
        $data = $request->validate(['id' => ['required', 'string', 'max:80']]);

        return DB::transaction(fn () => ['data' => $this->catalog->snapshot($this->catalog->lock($data['id']))]);
    }

    public function grants(Request $request): array
    {
        $grants = DB::table('ownership_grants')->join('places', 'places.id', '=', 'ownership_grants.place_id')
            ->where('user_id', $request->user()->id)->whereNull('revoked_at')->orderBy('places.id')
            ->get(['places.public_id', 'ownership_grants.contribution_id']);

        return ['data' => $grants->map(fn ($grant) => ['placeId' => $grant->public_id, 'requestId' => $grant->contribution_id])->all()];
    }

    public function reply(Request $request, int $reviewId): array
    {
        $data = $request->validate(['reviewVersion' => ['required', 'string', 'max:40'], 'text' => ['present', 'nullable', 'string', 'max:500']]);
        $this->workflow->reply($request->user(), $reviewId, $data['reviewVersion'], trim($data['text'] ?? ''));

        return ['data' => null];
    }

    public function reviews(Request $request): array
    {
        $data = $request->validate(['placeId' => ['required', 'string', 'max:80']]);
        $place = DB::table('places')->where('public_id', $data['placeId'])->first();
        abort_unless($place, 404);
        $reviews = DB::table('reviews')->where('place_id', $place->id)->whereNull('hidden_at')->orderByDesc('id')->limit(50)->get();

        return ['data' => $reviews->map(fn ($review) => $this->reviewResource($review, $place->public_id))->all()];
    }

    private function reviewResource(object $review, string $placeId): array
    {
        $photos = DB::table('review_photos')->where('review_id', $review->id)->whereNull('hidden_at')->orderBy('position')->orderBy('id')->get();

        return ['id' => (string) $review->id, 'placeId' => $placeId, 'rating' => (int) $review->rating,
            'text' => $review->text, 'visitedOn' => $review->visited_on ?? '', 'updatedAt' => CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString(),
            'photos' => $photos->map(fn ($photo) => '/api/review-photos/'.$photo->id)->all(),
            'photoIds' => $photos->map(fn ($photo) => (string) $photo->id)->all(), 'reply' => $this->workflow->visibleReply($review)];
    }

    private function listing(Request $request, bool $queue): array
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['pending', 'needs-info', 'approved', 'rejected', 'withdrawn', 'revoked'])],
            'kind' => ['sometimes', Rule::in(['new', 'update', 'claim', 'report'])],
            'per_page' => ['sometimes', 'integer', 'between:1,50'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $page = Contribution::query()->when(! $queue, fn ($query) => $query->where('user_id', $request->user()->id))
            ->when(isset($data['status']), fn ($query) => $query->where('status', $data['status']))
            ->when(isset($data['kind']), fn ($query) => $query->where('kind', $data['kind']))
            ->orderByDesc('created_at')->orderBy('id')->paginate($data['per_page'] ?? 24);

        return ['data' => $page->map(fn ($item) => $this->resource($item))->all(), 'meta' => [
            'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total(),
        ]];
    }

    private function resource(Contribution $item): array
    {
        $history = DB::table('moderation_events')->where('contribution_id', $item->id)->orderBy('version')->get();

        $review = $item->kind === 'report' ? DB::table('reviews')->where('id', $item->payload['reviewId'])->where('place_id', $item->place_id)->whereNull('hidden_at')->first() : null;

        $currentReview = $review ? $this->reviewResource($review, $item->public_place_id) : null;
        $photoIndex = isset($item->payload['photoId']) && $currentReview ? array_search((string) $item->payload['photoId'], $currentReview['photoIds'], true) : false;

        return [...$item->payload, ...($photoIndex !== false ? ['photoIndex' => $photoIndex] : []), 'id' => $item->id, 'placeId' => $item->public_place_id, 'actor' => $item->actor,
            'kind' => $item->kind, 'status' => $item->status, 'version' => $item->version,
            'baseRevision' => $item->base_revision, 'before' => $item->snapshot,
            'createdAt' => $item->created_at->toISOString(), 'updatedAt' => $item->updated_at->toISOString(),
            'currentReview' => $currentReview,
            'history' => $history->map(fn ($event) => ['actor' => $event->actor, 'actorId' => (string) $event->user_id,
                'status' => $event->status, 'reason' => $event->reason, 'version' => $event->version,
                'at' => CarbonImmutable::parse($event->created_at, 'UTC')->toISOString()])->all(),
        ];
    }
}
