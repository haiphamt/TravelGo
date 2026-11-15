<?php

namespace App\Services\Rooms;

use App\Models\TripRoom;
use App\Models\User;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class RoomService
{
    public function __construct(private readonly RoomPlaceCatalog $catalog) {}

    public function rooms(User $user): array
    {
        return DB::transaction(fn () => TripRoom::query()
            ->whereIn('id', DB::table('trip_room_members')->select('room_id')->where('user_id', $user->id))
            ->orderByDesc('id')->get()->map(fn ($room) => $this->present($room, $user))->all());
    }

    public function create(User $user, array $data): array
    {
        for ($attempt = 0; $attempt < 8; $attempt++) {
            try {
                return DB::transaction(function () use ($user, $data) {
                    $room = TripRoom::query()->create([
                        'code' => RoomRules::inviteCode(), 'owner_id' => $user->id,
                        'title' => trim($data['title']), 'date' => $data['date'] ?: null,
                        'desired_stops' => $data['desiredStops'], 'phase' => 'preparing', 'revision' => 1,
                    ]);
                    DB::table('trip_room_members')->insert([
                        'room_id' => $room->id, 'user_id' => $user->id,
                        'display_name' => $this->displayName($user, $data),
                    ]);

                    return $this->present($room, $user);
                }, 5);
            } catch (QueryException $error) {
                if (($error->errorInfo[1] ?? null) !== 1062 || ! str_contains($error->getMessage(), 'trip_rooms_code_unique')) {
                    throw $error;
                }
            }
        }

        throw new HttpException(503, 'Chưa thể tạo mã mời. Vui lòng thử lại.');
    }

    public function join(string $code, User $user, array $data): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $data) {
            if ($this->isMember($room, $user)) {
                return;
            }
            $this->requirePhase($room, ['preparing', 'voting']);
            if (DB::table('trip_room_members')->where('room_id', $room->id)->count() >= RoomRules::MEMBER_LIMIT) {
                throw new HttpException(409, 'Phòng đã đủ 12 thành viên.');
            }
            DB::table('trip_room_members')->insert([
                'room_id' => $room->id, 'user_id' => $user->id,
                'display_name' => $this->displayName($user, $data),
            ]);
            $this->touch($room);
        }, memberRequired: false);
    }

    public function show(string $code, User $user): array
    {
        return $this->locked($code, $user, fn () => null);
    }

    public function suggest(string $code, User $user, string $placeId): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $placeId) {
            $this->requirePhase($room, ['preparing']);
            $place = $this->catalog->resolve([$placeId])->get($placeId);
            $proposals = DB::table('trip_room_places')->where('room_id', $room->id);
            if ((clone $proposals)->where('place_id', $place->id)->exists()) {
                throw ValidationException::withMessages(['placeId' => 'Địa điểm này đã được đề xuất.']);
            }
            if ($proposals->count() >= RoomRules::PLACE_LIMIT) {
                throw ValidationException::withMessages(['placeId' => 'Mỗi phòng có tối đa 12 đề xuất.']);
            }
            DB::table('trip_room_places')->insert([
                'room_id' => $room->id, 'place_id' => $place->id,
                'proposed_by' => $user->id, 'name' => $place->name,
            ]);
            $this->touch($room);
        });
    }

    public function removeSuggestion(string $code, User $user, string $placeId): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $placeId) {
            $this->requireOwner($room, $user);
            $this->requirePhase($room, ['preparing']);
            DB::table('trip_room_places')->where('room_id', $room->id)
                ->whereIn('place_id', DB::table('places')->select('id')->where('public_id', $placeId))->delete();
            $this->touch($room);
        });
    }

    public function openVoting(string $code, User $user): array
    {
        return $this->locked($code, $user, function ($room) use ($user) {
            $this->requireOwner($room, $user);
            if ($room->phase === 'voting') {
                return;
            }
            $this->requirePhase($room, ['preparing']);
            $ids = $this->proposalIds($room);
            if ($ids === []) {
                throw ValidationException::withMessages(['places' => 'Thêm ít nhất một địa điểm trước khi mở bình chọn.']);
            }
            $this->catalog->resolve($ids);
            $room->phase = 'voting';
            $this->touch($room);
        });
    }

    public function vote(string $code, User $user, array $placeIds): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $placeIds) {
            $this->requirePhase($room, ['voting']);
            $places = $this->catalog->resolve($placeIds);
            if (array_diff($placeIds, $this->proposalIds($room))) {
                throw ValidationException::withMessages(['placeIds' => 'Chỉ được chọn địa điểm đã đề xuất trong phòng.']);
            }
            DB::table('trip_room_votes')->where('room_id', $room->id)->where('user_id', $user->id)->delete();
            foreach ($placeIds as $placeId) {
                DB::table('trip_room_votes')->insert([
                    'room_id' => $room->id, 'user_id' => $user->id, 'place_id' => $places[$placeId]->id,
                ]);
            }
            $this->touch($room);
        });
    }

    public function finalize(string $code, User $user, array $placeIds): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $placeIds) {
            $this->requireOwner($room, $user);
            if ($room->phase === 'finalized') {
                return;
            }
            $this->requirePhase($room, ['voting']);
            $places = $this->catalog->resolve($placeIds);
            if (array_diff($placeIds, $this->proposalIds($room))) {
                throw ValidationException::withMessages(['placeIds' => 'Chỉ được chốt địa điểm trong danh sách đề xuất.']);
            }
            $hasVotes = DB::table('trip_room_votes as votes')->join('places as places', 'places.id', '=', 'votes.place_id')
                ->where('votes.room_id', $room->id)->where('places.city', 'hcm')->exists();
            if (! $hasVotes) {
                throw ValidationException::withMessages(['votes' => 'Cần ít nhất một phiếu hợp lệ để chốt.']);
            }
            $room->result = array_map(fn ($id, $index) => $this->stop($places[$id], RoomRules::defaultTime($index)), $placeIds, array_keys($placeIds));
            $room->phase = 'finalized';
            $this->touch($room);
        });
    }

    /** Edits only the working itinerary; the original decision remains immutable. */
    public function itinerary(string $code, User $user, array $data): array
    {
        return $this->locked($code, $user, function ($room) use ($user, $data) {
            $this->requireOwner($room, $user);
            $this->requirePhase($room, ['finalized']);
            if ((int) $data['revision'] !== $room->revision) {
                throw new HttpException(409, 'Lịch trình vừa thay đổi. Hãy tải lại phòng trước khi chỉnh tiếp.');
            }
            $places = $this->catalog->resolve(array_column($data['stops'], 'placeId'));
            $previous = collect($room->itinerary ?? $room->result)->keyBy('placeId');
            $room->itinerary = array_map(function ($stop) use ($places, $previous) {
                $saved = $previous->get($stop['placeId']);

                // A client cannot inject a fabricated name, price or snapshot.
                return ($saved && ! ($stop['refreshSnapshot'] ?? false))
                    ? [...$saved, 'time' => $stop['time'], ...(isset($stop['keptRevision']) ? ['keptRevision' => $stop['keptRevision']] : [])]
                    : $this->stop($places[$stop['placeId']], $stop['time']);
            }, $data['stops']);
            $this->touch($room);
        });
    }

    private function stop(object $place, string $time): array
    {
        return ['placeId' => $place->public_id, 'name' => $place->name, 'time' => $time, 'snapshot' => $this->catalog->snapshot($place)];
    }

    private function locked(string $code, User $user, Closure $change, bool $memberRequired = true): array
    {
        return DB::transaction(function () use ($code, $user, $change, $memberRequired) {
            $room = TripRoom::query()->where('code', $code)->lockForUpdate()->first();
            if (! $room) {
                throw new HttpException(404, 'Mã phòng không tồn tại.');
            }
            if ($memberRequired && ! $this->isMember($room, $user)) {
                throw new HttpException(403, 'Bạn chưa tham gia phòng này.');
            }
            $change($room);

            return $this->present($room, $user);
        }, 5);
    }

    private function isMember(TripRoom $room, User $user): bool
    {
        return DB::table('trip_room_members')->where('room_id', $room->id)->where('user_id', $user->id)->exists();
    }

    private function requireOwner(TripRoom $room, User $user): void
    {
        if ((string) $room->owner_id !== (string) $user->id) {
            throw new HttpException(403, 'Chỉ chủ phòng được thực hiện thao tác này.');
        }
    }

    private function requirePhase(TripRoom $room, array $phases): void
    {
        if (! in_array($room->phase, $phases, true)) {
            throw new HttpException(409, 'Trạng thái phòng đã thay đổi. Hãy tải lại phòng.');
        }
    }

    private function touch(TripRoom $room): void
    {
        $room->revision++;
        $room->save();
    }

    private function displayName(User $user, array $data): string
    {
        $name = Str::trim($data['name'] ?? $user->name);
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Nhập tên hiển thị để tham gia phòng.']);
        }

        return mb_substr($name, 0, 40);
    }

    private function proposalIds(TripRoom $room): array
    {
        return DB::table('trip_room_places as rp')->join('places as p', 'p.id', '=', 'rp.place_id')
            ->where('rp.room_id', $room->id)->orderBy('rp.id')->pluck('p.public_id')->all();
    }

    private function present(TripRoom $room, User $user): array
    {
        $places = DB::table('trip_room_places as rp')->join('places as p', 'p.id', '=', 'rp.place_id')
            ->where('rp.room_id', $room->id)->orderBy('rp.id')
            ->get(['p.public_id as placeId', 'rp.name'])->map(fn ($place) => (array) $place)->all();
        $members = DB::table('trip_room_members')->where('room_id', $room->id)->orderBy('id')->get()
            ->map(fn ($member) => ['id' => (string) $member->user_id, 'name' => $member->display_name])->all();
        $votes = DB::table('trip_room_votes as rv')->join('places as p', 'p.id', '=', 'rv.place_id')
            ->where('rv.room_id', $room->id)->orderBy('rv.id')->get()
            ->map(fn ($vote) => ['memberId' => (string) $vote->user_id, 'placeId' => $vote->public_id])->all();

        return [
            'code' => $room->code, 'title' => $room->title, 'date' => $room->date ?? '',
            'desiredStops' => (int) $room->desired_stops, 'ownerId' => (string) $room->owner_id,
            'activeMemberId' => (string) $user->id, 'votingOpened' => $room->phase !== 'preparing',
            'phase' => $room->phase, 'revision' => $room->revision,
            'members' => $members, 'places' => $places, 'votes' => $votes,
            'result' => $room->result ?? [], 'itinerary' => $room->itinerary,
        ];
    }
}
