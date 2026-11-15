<?php

namespace App\Services;

use App\Models\Itinerary;
use App\Models\TripRoom;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class RoomItineraryCopyService
{
    public function __construct(private readonly ItineraryService $itineraries) {}

    public function copy(int $userId, string $code, int $revision): Itinerary
    {
        return DB::transaction(function () use ($userId, $code, $revision) {
            // Use the same room lock as edits/finalization, including during duplicate requests.
            $room = TripRoom::query()->where('code', $code)->lockForUpdate()->firstOrFail();
            abort_unless(DB::table('trip_room_members')->where('room_id', $room->id)->where('user_id', $userId)->exists(),
                403, 'Chỉ thành viên phòng mới được lưu bản lịch trình cá nhân.');
            abort_unless($room->phase === 'finalized' && $room->revision === $revision,
                409, 'Phòng vừa thay đổi hoặc chưa chốt. Tải lại phòng trước khi lưu.');

            $existing = DB::table('itinerary_room_copies')->where([
                'room_id' => $room->id, 'user_id' => $userId, 'room_revision' => $revision,
            ])->value('itinerary_id');
            if ($existing) {
                // A retry must not overwrite changes the member has made to their own copy.
                return $this->itineraries->owned($userId, $existing);
            }

            $stops = $room->itinerary ?? $room->result;
            Validator::make(['stops' => $stops], [
                'stops' => ['required', 'array', 'list', 'min:1', 'max:5'],
                'stops.*.placeId' => ['required', 'string', 'distinct:strict', 'max:80'],
                'stops.*.time' => ['required', 'date_format:H:i'],
                'stops.*.snapshot' => ['required', 'array'],
            ])->validate();
            $ids = array_column($stops, 'placeId');
            $valid = DB::table('places')->whereIn('public_id', $ids)->where('city', 'hcm')->sharedLock()->pluck('public_id')->all();
            if (count($valid) !== count($ids)) {
                throw ValidationException::withMessages([
                    'roomCode' => 'Có điểm ghé không còn trong danh mục của phòng. Nhờ chủ phòng thay điểm đó rồi lưu lại.',
                ]);
            }

            $trip = $this->itineraries->save($userId, [
                'name' => $room->title, 'date' => $room->date ?? '', 'source' => 'room',
                'points' => array_map(fn ($stop) => ['placeId' => $stop['placeId'], 'time' => $stop['time']], $stops),
            ]);
            foreach ($trip->stops()->get() as $stop) {
                $source = $stops[$stop->position];
                // These snapshots come from the locked server room, never from the request body.
                $stop->update(['snapshot' => $source['snapshot'], 'kept_revision' => $source['keptRevision'] ?? null]);
            }
            DB::table('itinerary_room_copies')->insert([
                'room_id' => $room->id, 'user_id' => $userId,
                'room_revision' => $revision, 'itinerary_id' => $trip->id,
            ]);

            return $trip;
        }, 5);
    }
}
