<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Rooms\RoomService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class TripRoomConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();
        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Concurrency tests require MySQL travelgo_test.');
        }
        $server = $connection->selectOne('SELECT DATABASE() AS db, VERSION() AS version', [], false);
        if ($server->db !== 'travelgo_test' || stripos($server->version, 'MariaDB') !== false) {
            throw new RuntimeException('Concurrency tests refuse non-test schemas and MariaDB.');
        }
    }

    private function race(array $room, array $operations): array
    {
        $processes = [];
        DB::beginTransaction();
        try {
            DB::table('trip_rooms')->where('code', $room['code'])->lockForUpdate()->first();
            foreach ($operations as [$operation, $user, $ids]) {
                $process = new Process([PHP_BINARY, base_path('tests/Fixtures/room-worker.php'),
                    $operation, $room['code'], (string) $user->id, json_encode($ids)], base_path());
                $process->setTimeout(20);
                $process->start();
                $processes[] = $process;
            }
            foreach ($processes as $process) {
                $this->assertTrue($process->waitUntil(fn ($type, $output) => str_contains($output, 'ready')),
                    $process->getErrorOutput());
                $this->assertTrue($process->isRunning(), 'The worker must wait for the room row lock.');
            }
            DB::commit();

            return array_map(function ($process) {
                $this->assertSame(0, $process->wait(), $process->getErrorOutput());
                $lines = array_values(array_filter(explode("\n", $process->getOutput())));

                return json_decode(end($lines), true, flags: JSON_THROW_ON_ERROR)['status'];
            }, $processes);
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
            foreach ($processes as $process) {
                if ($process->isRunning()) {
                    $process->stop();
                }
            }
        }
    }

    private function fixture(): array
    {
        $owner = User::factory()->create();
        $guest = User::factory()->create();
        $rooms = app(RoomService::class);
        $room = $rooms->create($owner, ['title' => 'TravelGo Demo concurrent', 'date' => null, 'desiredStops' => 2]);
        $rooms->join($room['code'], $guest, []);
        foreach ([1, 2] as $number) {
            DB::table('places')->insert(['public_id' => 'osm:node/'.$number, 'source' => 'demo',
                'source_id' => (string) $number, 'name' => 'TravelGo Demo '.$number, 'city' => 'hcm', 'category' => 'food']);
        }

        return [$rooms, $room, $owner, $guest];
    }

    public function test_two_joins_cannot_take_the_last_slot_twice(): void
    {
        [$rooms, $room, $owner] = $this->fixture();
        for ($i = 0; $i < 9; $i++) {
            $rooms->join($room['code'], User::factory()->create(), []);
        }
        $statuses = $this->race($room, [
            ['join', User::factory()->create(), []], ['join', User::factory()->create(), []],
        ]);
        sort($statuses);
        $this->assertSame([200, 409], $statuses);
        $this->assertCount(12, $rooms->show($room['code'], $owner)['members']);
    }

    public function test_two_members_proposing_the_same_place_do_not_create_duplicates(): void
    {
        [$rooms, $room, $owner, $guest] = $this->fixture();
        $statuses = $this->race($room, [
            ['suggest', $owner, ['osm:node/1']], ['suggest', $guest, ['osm:node/1']],
        ]);
        sort($statuses);
        $this->assertSame([200, 422], $statuses);
        $this->assertDatabaseCount('trip_room_places', 1);
    }

    public function test_vote_and_finalize_serialize_and_never_write_votes_after_the_decision(): void
    {
        [$rooms, $room, $owner, $guest] = $this->fixture();
        $rooms->suggest($room['code'], $owner, 'osm:node/1');
        $rooms->suggest($room['code'], $owner, 'osm:node/2');
        $rooms->openVoting($room['code'], $owner);
        $rooms->vote($room['code'], $owner, ['osm:node/1']);
        [$finalStatus, $voteStatus] = $this->race($room, [
            ['finalize', $owner, ['osm:node/2', 'osm:node/1']], ['vote', $guest, ['osm:node/2']],
        ]);
        $this->assertSame(200, $finalStatus);
        $this->assertContains($voteStatus, [200, 409]);
        $closed = $rooms->show($room['code'], $owner);
        $this->assertSame('finalized', $closed['phase']);
        $this->assertSame(['osm:node/2', 'osm:node/1'], array_column($closed['result'], 'placeId'));
        $count = DB::table('trip_room_votes')->count();
        $this->assertSame($voteStatus === 200 ? 2 : 1, $count);
        $this->actingAs($guest)->putJson('/api/rooms/'.$room['code'].'/votes', ['placeIds' => []])->assertConflict();
        $this->assertSame($count, DB::table('trip_room_votes')->count());
    }

    public function test_two_copy_requests_for_the_same_member_and_revision_create_only_one_itinerary(): void
    {
        [$rooms, $room, $owner] = $this->fixture();
        $rooms->suggest($room['code'], $owner, 'osm:node/1');
        $rooms->openVoting($room['code'], $owner);
        $rooms->vote($room['code'], $owner, ['osm:node/1']);
        $room = $rooms->finalize($room['code'], $owner, ['osm:node/1']);
        $this->assertSame([200, 200], $this->race($room, [
            ['copy', $owner, [$room['revision']]], ['copy', $owner, [$room['revision']]],
        ]));
        $this->assertDatabaseCount('itineraries', 1);
        $this->assertDatabaseCount('itinerary_stops', 1);
        $this->assertDatabaseCount('itinerary_room_copies', 1);
    }
}
