<?php

namespace App\Services;

use App\Models\Itinerary;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ItineraryService
{
    public function owned(int $userId, string $id): Itinerary
    {
        return Itinerary::query()->where('user_id', $userId)->findOrFail($id);
    }

    public function save(int $userId, array $data, ?string $id = null): Itinerary
    {
        return DB::transaction(function () use ($userId, $data, $id) {
            $trip = $id ? Itinerary::query()->where('user_id', $userId)->lockForUpdate()->findOrFail($id) : new Itinerary;
            if ($id && $trip->version !== (int) $data['version']) {
                abort(409, 'Lịch trình đã được sửa ở nơi khác. Tải lại trước khi lưu.');
            }
            $old = $id ? $trip->stops()->get()->keyBy('place_id') : collect();
            $places = DB::table('places')->whereIn('public_id', array_column($data['points'], 'placeId'))->sharedLock()->get()->keyBy('public_id');
            $cities = [];
            foreach ($data['points'] as $i => $point) {
                $place = $places->get($point['placeId']);
                if (! $place) {
                    throw ValidationException::withMessages(["points.$i.placeId" => 'Địa điểm không tồn tại trong danh mục TravelGo.']);
                }
                $cities[$place->city] = true;
            }
            if (count($cities) > 1) {
                throw ValidationException::withMessages(['points' => 'Các điểm ghé phải thuộc cùng thành phố.']);
            }
            $trip->fill([
                'id' => $id ?? (string) Str::uuid(), 'user_id' => $userId,
                'name' => trim($data['name']), 'date' => $data['date'] ?: null,
                'end_date' => $data['endDate'] ?? null, 'note' => $data['note'] ?? null,
                'budget' => $data['budget'] ?? null, 'cover' => $data['cover'] ?? null,
                'source' => $id ? $trip->source : ($data['source'] ?? 'manual'),
                'version' => $id ? $trip->version + 1 : 1,
            ])->save();
            // Replace within the same transaction, so a failing stop never loses the saved plan.
            $trip->stops()->delete();
            foreach ($data['points'] as $i => $point) {
                $place = $places[$point['placeId']];
                $trip->stops()->create([
                    'place_id' => $place->id, 'position' => $i,
                    'date' => $point['date'] ?? null, 'time' => $point['time'],
                    'note' => $point['note'] ?? null, 'estimated_cost' => $point['estimatedCost'] ?? null,
                    // Approved-place revision handling is a separate contract with places/moderation.
                    // Ordinary edits preserve snapshots. Client-supplied snapshots are never trusted.
                    'snapshot' => $old->get($place->id)?->snapshot ?? self::snapshot($place),
                ]);
            }

            return $trip->refresh();
        });
    }

    public static function snapshot(object $place): array
    {
        return [
            'name' => $place->name, 'area' => $place->area ?? 'Chưa cập nhật địa chỉ',
            'lat' => $place->lat === null ? null : (float) $place->lat,
            'lng' => $place->lng === null ? null : (float) $place->lng,
            'price' => $place->price === null ? null : (float) $place->price,
            'hours' => $place->hours, 'status' => null,
        ];
    }

    public function payload(Itinerary $trip): array
    {
        $points = DB::table('itinerary_stops as s')->join('places as p', 'p.id', '=', 's.place_id')
            ->where('s.itinerary_id', $trip->id)->orderBy('s.position')
            ->get(['s.*', 'p.public_id']);

        return [
            'id' => $trip->id, 'name' => $trip->name, 'date' => $trip->date ?? '',
            'endDate' => $trip->end_date ?? '', 'note' => $trip->note ?? '',
            'budget' => $trip->budget, 'cover' => $trip->cover ?? '',
            'source' => $trip->source, 'version' => $trip->version,
            'points' => $points->map(fn ($p) => [
                'placeId' => $p->public_id, 'time' => $p->time, 'date' => $p->date,
                'note' => $p->note, 'estimatedCost' => $p->estimated_cost === null ? null : (int) $p->estimated_cost,
                'snapshot' => json_decode($p->snapshot, true, flags: JSON_THROW_ON_ERROR),
            ])->all(),
        ];
    }
}
