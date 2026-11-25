<?php

namespace App\Http\Controllers;

use App\Http\Resources\PlaceResource;
use App\Models\Place;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedJsonResponse;

class PlaceController extends Controller
{
    private const IMAGE_ORDER = "CASE WHEN image IS NULL OR image = '' THEN 2 WHEN photo_source IS NULL THEN 1 ELSE 0 END";

    public function catalog(Request $request): StreamedJsonResponse
    {
        $places = $this->placesInCity('hcm')->orderByRaw(self::IMAGE_ORDER)->orderBy('places.id')
            ->cursor()->map(fn (Place $place) => (new PlaceResource($place))->resolve($request));

        return response()->streamJson(['data' => $places], 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function placesInCity(string $city): Builder
    {
        return Place::query()->where('city', $city)->withPublicReviewSummary();
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:200'],
            'city' => ['sometimes', 'string', Rule::in(['hcm'])],
            'category' => ['sometimes', 'string', Rule::in(['all', 'coffee', 'food', 'nature', 'culture', 'drink', 'lodging'])],
            'local' => ['sometimes', 'boolean'],
            'has_image' => ['sometimes', 'boolean'],
            'area' => ['sometimes', 'nullable', 'string', 'max:200'],
            'district' => ['sometimes', 'nullable', 'string', 'max:80'],
            'localType' => ['sometimes', 'nullable', 'string', 'max:80'],
            'facet' => ['sometimes', 'string', Rule::in(['always-open', 'wifi', 'outdoor', 'takeaway', 'wheelchair', 'hotel', 'homestay', 'viewpoint'])],
            'sort' => ['sometimes', 'string', Rule::in(['default', 'name', 'price'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = $this->placesInCity($filters['city'] ?? 'hcm');
        $localType = trim($filters['localType'] ?? '');

        if ($localType !== '') {
            $query->where('local', true)
                ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(local_profile, '$.categoryLabel')) COLLATE utf8mb4_bin = ?", [$localType]);
        } elseif (array_key_exists('local', $filters)) {
            $query->where('local', (bool) $filters['local']);
        }

        if (($filters['category'] ?? 'all') !== 'all') {
            $query->where('category', $filters['category']);
        }

        if ($filters['has_image'] ?? false) {
            $query->whereNotNull('image')->where('image', '!=', '');
        }

        $search = trim($filters['q'] ?? '');
        if ($search !== '') {
            // MySQL serializes JSON string arrays with ", " separators. Joining their
            // elements keeps the catalog's name / products / address search contract.
            $products = "REPLACE(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(products), ''), '\", \"', ' '), '[\"', ''), '\"]', '')";
            $address = "NULLIF(area, 'Chưa cập nhật địa chỉ')";
            $this->contains($query, "CONCAT_WS(' ', name, {$products}, {$address})", $search);
        }

        if (($area = trim($filters['area'] ?? '')) !== '') {
            $query->where('area', '!=', 'Chưa cập nhật địa chỉ');
            $this->contains($query, 'area', $area);
        }

        if (($district = trim($filters['district'] ?? '')) !== '') {
            $query->whereRaw($this->searchable('source_district').' = ?', [$this->foldD($district)]);
        }

        if (($filters['facet'] ?? '') === 'always-open') {
            $query->whereRaw("TRIM(hours) = '24/7'");
        } elseif (isset($filters['facet'])) {
            $query->whereJsonContains('facets', $filters['facet']);
        }

        match ($filters['sort'] ?? 'default') {
            'name' => $query->orderBy('name'),
            'price' => $query->orderByRaw('price IS NULL')->orderBy('price'),
            default => $query->orderByRaw(self::IMAGE_ORDER),
        };

        $page = $query->orderBy('places.id')->paginate($filters['per_page'] ?? 24);

        return response()->json([
            'data' => PlaceResource::collection($page->getCollection())->resolve($request),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function show(Request $request): PlaceResource
    {
        $input = $request->validate(['id' => ['required', 'string', 'max:80']]);
        $place = Place::query()->where('city', 'hcm')->where('public_id', $input['id'])
            ->withPublicReviewSummary()->firstOrFail();

        return new PlaceResource($place);
    }

    private function contains(Builder $query, string $expression, string $value): void
    {
        $pattern = strtr($this->foldD($value), ['=' => '==', '%' => '=%', '_' => '=_']);
        $query->whereRaw($this->searchable($expression)." LIKE ? ESCAPE '='", ["%{$pattern}%"]);
    }

    private function searchable(string $expression): string
    {
        return "REPLACE(REPLACE(LOWER({$expression}), 'đ', 'd'), 'ð', 'd') COLLATE utf8mb4_unicode_ci";
    }

    private function foldD(string $value): string
    {
        return str_replace(['đ', 'Đ', 'ð', 'Ð'], 'd', $value);
    }
}
