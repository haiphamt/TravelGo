<?php

namespace App\Services;

use App\Contracts\ItinerarySuggestionProvider;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

class ItinerarySuggestionService
{
    public function __construct(private ItinerarySuggestionProvider $provider) {}

    public function preview(array $input): array
    {
        $area = MockItinerarySuggestionProvider::plain($input['area'] ?? '');
        $all = DB::table('places')->where('city', 'hcm')->whereNotNull('lat')->whereNotNull('lng')
            ->when(! $input['includeLocal'], fn ($q) => $q->where('local', false))
            ->select(['public_id', 'name', 'area', 'category', 'local', 'products'])->orderBy('id')->cursor();
        $catalog = $all->filter(fn ($p) => ! $area || str_contains(' '.MockItinerarySuggestionProvider::plain($p->area ?? '').' ', " $area "))
            ->take(500)->map(fn ($p) => [
                'id' => $p->public_id, 'name' => $p->name, 'area' => $p->area ?? '',
                'category' => $p->category, 'local' => (bool) $p->local,
                'products' => array_values(array_filter(json_decode($p->products ?? '[]', true) ?? [], 'is_string')),
            ])->values()->all();
        if (! $catalog) {
            throw ValidationException::withMessages(['needs' => 'Chưa có địa điểm phù hợp. Bạn có thể đổi nhu cầu hoặc tạo thủ công.']);
        }
        try {
            $ids = $this->provider->suggest($catalog, $input);
        } catch (Throwable $error) {
            report($error);
            abort(503, 'Chưa tạo được gợi ý. Bản nháp vẫn được giữ; bạn có thể tạo thủ công.');
        }
        $allowed = array_column($catalog, null, 'id');
        if (! array_is_list($ids) || count($ids) > $input['count'] || count($ids) !== count(array_unique($ids, SORT_REGULAR)) ||
            array_filter($ids, fn ($id) => ! is_string($id) || ! isset($allowed[$id])) ||
            count(array_filter($ids, fn ($id) => $allowed[$id]['local'])) > 1) {
            abort(502, 'Kết quả gợi ý không hợp lệ. Bạn có thể thử lại hoặc tạo thủ công.');
        }
        if (! $ids) {
            throw ValidationException::withMessages(['needs' => 'Chưa tìm được điểm phù hợp trong danh mục.']);
        }
        $start = CarbonImmutable::parse($input['startDate']);
        $days = min(count($ids), (int) $start->diffInDays($input['endDate']) + 1);
        $points = [];
        foreach ($ids as $index => $id) {
            $day = (int) floor($index * $days / count($ids));
            $slot = $index - (int) ceil($day * count($ids) / $days);
            $points[] = ['placeId' => $id, 'date' => $start->addDays($day)->toDateString(), 'time' => sprintf('%02d:00', 8 + $slot * 2)];
        }

        return [
            'points' => $points,
            'unmatched' => MockItinerarySuggestionProvider::unmatched($catalog, $input['requested'] ?? [], $ids),
            'source' => 'ai-demo',
            'notice' => 'Gợi ý mô phỏng từ danh mục TravelGo. Hãy kiểm tra điểm ghé và giờ trước khi lưu.',
        ];
    }
}
