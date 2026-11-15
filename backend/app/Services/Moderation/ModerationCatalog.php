<?php

namespace App\Services\Moderation;

use App\Models\Contribution;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ModerationCatalog
{
    private const FIELDS = ['name', 'area', 'category', 'description', 'hours', 'products', 'lat', 'lng', 'price', 'image', 'images', 'photo_credit', 'photo_source', 'source_district', 'moderation_status'];

    public function lock(string $publicId, bool $reconcile = true): object
    {
        $place = DB::table('places')->where('public_id', $publicId)->lockForUpdate()->first();
        abort_unless($place, 404, 'Không tìm thấy địa điểm.');

        return $reconcile ? $this->reconcile($place) : $place;
    }

    public function revision(object $place): string
    {
        return hash('sha256', json_encode((array) $place, JSON_THROW_ON_ERROR));
    }

    public function snapshot(object $place): array
    {
        $result = ['id' => $place->public_id];
        foreach ((array) $place as $key => $value) {
            if (in_array($key, ['id', 'public_id'], true)) {
                continue;
            }
            $result[Str::camel($key)] = in_array($key, ['products', 'images', 'photo_source', 'local_profile', 'facets'], true) && is_string($value)
                ? json_decode($value, true, flags: JSON_THROW_ON_ERROR) : $value;
        }
        foreach (['lat', 'lng', 'price'] as $field) {
            $result[$field] = $place->$field === null ? null : (float) $place->$field;
        }
        $result['local'] = (bool) $place->local;
        $result['referenceOnly'] = (bool) $place->reference_only;
        $result['products'] ??= [];
        $result['images'] ??= [];
        $result['description'] ??= '';
        $result['area'] ??= 'Chưa cập nhật địa chỉ';
        $result['revision'] = $this->revision($place);
        $result['updated'] = $place->data_updated_at;
        foreach (['sourceUrl', 'sourceLabel', 'sourceLicense'] as $key) {
            $result[$key] ??= '';
        }
        if ($place->moderation_status !== null) {
            $result['demoChange'] = ['revision' => $result['revision'], 'kind' => $place->moderation_status === 'paused' ? 'pause' : 'closed',
                'effectiveFrom' => CarbonImmutable::parse($place->updated_at, 'UTC')->toISOString(), 'effectiveUntil' => null,
                'status' => $place->moderation_status, 'fields' => []];
        }

        return $result;
    }

    public function approve(Contribution $request, ?object $place): void
    {
        if ($request->kind === 'new') {
            // New places are published immediately. Scheduled publication needs the public API's visibility contract.
            abort_if(($request->payload['effectiveFrom'] ?? '') > now()->toISOString(), 409, 'Chưa hỗ trợ xuất bản địa điểm mới trong tương lai.');
            $patch = $request->payload['patch'];
            abort_if(DB::table('places')->where('name', $patch['name'])->where('area', $patch['area'])->exists(), 409, 'Tên và địa chỉ đã có trong danh mục.');
            $id = DB::table('places')->insertGetId([
                'public_id' => $request->public_place_id, 'source' => 'travelgo', 'source_id' => $request->public_place_id,
                'name' => $patch['name'], 'area' => $patch['area'], 'category' => $patch['category'], 'city' => 'hcm',
                'source_label' => 'Đóng góp TravelGo đã duyệt', 'source_license' => 'Thông tin do người gửi cung cấp',
                'reference_only' => true, 'created_at' => now(), 'updated_at' => now(),
                ...$this->patch($patch),
            ]);
            $request->place_id = $id;

            return;
        }
        abort_unless($place && hash_equals($request->base_revision, $this->revision($place)), 409, 'Địa điểm đã thay đổi. Yêu cầu bổ sung để đối chiếu lại.');
        // Do not stack edits on an unresolved future/temporary change. This also protects expiry restoration.
        $reserved = Contribution::query()->where('place_id', $place->id)->where('kind', 'update')->where('status', 'approved')
            ->whereKeyNot($request->id)->get()->contains(fn ($item) => ($item->payload['effectiveFrom'] ?? '') > now()->toISOString() || ($item->payload['effectiveUntil'] ?? '') > now()->toISOString());
        abort_if($reserved, 409, 'Địa điểm có cập nhật tạm hoặc sắp có hiệu lực.');
        abort_if(($request->payload['effectiveUntil'] ?? null) !== null && $request->payload['effectiveUntil'] <= now()->toISOString(), 409, 'Thời hạn đã qua.');
        if (! DB::table('moderation_place_states')->where('place_id', $place->id)->exists()) {
            DB::table('moderation_place_states')->insert([
                'place_id' => $place->id,
                'baseline' => json_encode(array_intersect_key((array) $place, array_flip(self::FIELDS)), JSON_THROW_ON_ERROR),
                'materialized_revision' => $this->revision($place),
            ]);
        }
    }

    public function reconcile(object $place): object
    {
        $state = DB::table('moderation_place_states')->where('place_id', $place->id)->first();
        if (! $state) {
            return $place;
        }
        $updates = Contribution::query()->join('moderation_events', 'moderation_events.contribution_id', '=', 'contributions.id')
            ->where('place_id', $place->id)->where('kind', 'update')->where('contributions.status', 'approved')
            ->where('moderation_events.status', 'approved')->orderBy('moderation_events.id')->select('contributions.*')->get();
        $target = json_decode($state->baseline, true, flags: JSON_THROW_ON_ERROR);
        foreach ($updates as $update) {
            if (WorkflowRules::active($update->payload, $update->approved_at->toISOString(), CarbonImmutable::now())) {
                $target = [...$target, ...$this->patch($update->payload['patch'] ?? [])];
                if (in_array($update->payload['change'], ['pause', 'closed'], true)) {
                    $target['moderation_status'] = $update->payload['change'] === 'pause' ? 'paused' : 'closed';
                }
            }
        }
        $current = array_intersect_key((array) $place, array_flip(self::FIELDS));
        // MySQL normalizes JSON whitespace and decimals; compare decoded values rather than serialized text.
        if ($this->comparable($target) === $this->comparable($current)) {
            return $place;
        }
        abort_unless(hash_equals($state->materialized_revision, $this->revision($place)), 409, 'Dữ liệu nguồn đã đổi; cần đối chiếu trước khi áp dụng hoặc khôi phục cập nhật.');
        DB::table('places')->where('id', $place->id)->update([...$target, 'updated_at' => now()]);
        $place = DB::table('places')->find($place->id);
        DB::table('moderation_place_states')->where('place_id', $place->id)->update(['materialized_revision' => $this->revision($place)]);

        return $place;
    }

    private function comparable(array $value): array
    {
        foreach (['products', 'images', 'photo_source'] as $key) {
            if (isset($value[$key]) && is_string($value[$key])) {
                $value[$key] = json_decode($value[$key], true, flags: JSON_THROW_ON_ERROR);
            }
        }
        foreach (['lat', 'lng', 'price'] as $key) {
            if (isset($value[$key])) {
                $value[$key] = (float) $value[$key];
            }
        }

        ksort($value);

        return $value;
    }

    private function patch(array $patch): array
    {
        $result = array_intersect_key($patch, array_flip(['name', 'area', 'category', 'description', 'hours', 'lat', 'lng', 'price']));
        if (array_key_exists('products', $patch)) {
            $result['products'] = json_encode($patch['products'], JSON_THROW_ON_ERROR);
        }
        if (array_key_exists('area', $patch) || array_key_exists('lat', $patch) || array_key_exists('lng', $patch)) {
            $result['source_district'] = null;
        }
        if (isset($patch['photo'])) {
            $result = [...$result, 'image' => $patch['photo']['dataUrl'], 'images' => json_encode([$patch['photo']['dataUrl']], JSON_THROW_ON_ERROR),
                'photo_credit' => $patch['photo']['credit'], 'photo_source' => null];
        }

        return $result;
    }
}
