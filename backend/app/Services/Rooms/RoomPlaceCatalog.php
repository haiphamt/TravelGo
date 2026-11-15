<?php

namespace App\Services\Rooms;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RoomPlaceCatalog
{
    /** Public IDs stay strings, including the slash in OSM IDs. */
    public function resolve(array $ids): Collection
    {
        $places = DB::table('places')->whereIn('public_id', $ids)->where('city', 'hcm')
            ->get()->keyBy('public_id');

        foreach ($ids as $id) {
            if (! $places->has($id)) {
                throw ValidationException::withMessages(['placeIds' => 'Có địa điểm không còn trong danh mục của phòng.']);
            }
        }

        return $places;
    }

    public function snapshot(object $place): array
    {
        return [
            'name' => $place->name,
            'area' => $place->area ?? 'Chưa cập nhật địa chỉ',
            'lat' => $place->lat === null ? null : (float) $place->lat,
            'lng' => $place->lng === null ? null : (float) $place->lng,
            'price' => $place->price === null ? null : (float) $place->price,
            'hours' => $place->hours,
            'status' => null,
        ];
    }
}
