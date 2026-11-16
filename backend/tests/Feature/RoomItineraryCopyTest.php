<?php

namespace Tests\Feature;

use App\Models\ItineraryStop;
use App\Models\User;
use App\Services\RoomItineraryCopyService;
use App\Services\Rooms\RoomService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class RoomItineraryCopyTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();
        $actual = $connection->selectOne('SELECT DATABASE() AS db, VERSION() AS version', [], false);
        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' ||
            $actual->db !== 'travelgo_test' || stripos($actual->version, 'MariaDB') !== false) {
            throw new RuntimeException('Room copy tests require the dedicated MySQL travelgo_test database.');
        }
    }

    private function fixture(bool $finalize = true): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $rooms = app(RoomService::class);
        foreach ([1, 2] as $i) {
            DB::table('places')->insert([
                'public_id' => 'osm:node/'.$i, 'source' => 'demo', 'source_id' => 'room-copy-'.$i,
                'name' => 'TravelGo Demo '.$i, 'city' => 'hcm', 'category' => 'food',
                'price' => $i === 1 ? null : 0,
            ]);
        }
        $room = $rooms->create($owner, ['title' => 'TravelGo Demo cá nhân', 'date' => '2026-12-01', 'desiredStops' => 2]);
        $rooms->join($room['code'], $member, []);
        foreach (['osm:node/1', 'osm:node/2'] as $id) {
            $rooms->suggest($room['code'], $owner, $id);
        }
        if ($finalize) {
            $rooms->openVoting($room['code'], $owner);
            $rooms->vote($room['code'], $member, ['osm:node/1']);
            $room = $rooms->finalize($room['code'], $owner, ['osm:node/2', 'osm:node/1']);
        }

        return [$rooms, $room, $owner, $member];
    }

    private function copy(array $room): array
    {
        return $this->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
        ])->assertOk()->json('data');
    }

    public function test_copy_requires_authentication_valid_input_and_a_known_room(): void
    {
        $this->postJson('/api/itineraries/from-room', [])->assertUnauthorized();
        $this->actingAs(User::factory()->create());
        foreach ([[], ['roomCode' => '../bad', 'roomRevision' => 1],
            ['roomCode' => 'AB123456', 'roomRevision' => 0], ['roomCode' => 'AB123456', 'roomRevision' => 1.5]] as $invalid) {
            $this->postJson('/api/itineraries/from-room', $invalid)->assertUnprocessable();
        }
        $this->postJson('/api/itineraries/from-room', ['roomCode' => '00000000', 'roomRevision' => 1])->assertNotFound();
        $this->assertDatabaseCount('itineraries', 0);
    }

    public function test_only_members_of_a_finalized_room_can_copy_the_revision_they_read(): void
    {
        [$rooms, $room, $owner, $member] = $this->fixture(false);
        $this->actingAs(User::factory()->create())->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
        ])->assertForbidden();
        $this->actingAs($member)->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
        ])->assertConflict();
        $open = $rooms->openVoting($room['code'], $owner);
        $this->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $open['revision'],
        ])->assertConflict();
        $rooms->vote($room['code'], $member, ['osm:node/1']);
        $closed = $rooms->finalize($room['code'], $owner, ['osm:node/1']);
        $this->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $open['revision'],
        ])->assertConflict();
        $this->copy($closed);
        $this->assertDatabaseCount('itineraries', 1);
    }

    public function test_copy_uses_the_server_working_itinerary_and_preserves_order_time_and_old_snapshots(): void
    {
        [$rooms, $room, $owner, $member] = $this->fixture();
        DB::table('places')->where('public_id', 'osm:node/1')->update(['name' => 'Tên hiện tại khác', 'price' => 75000]);
        $room = $rooms->itinerary($room['code'], $owner, [
            'revision' => $room['revision'], 'stops' => [
                ['placeId' => 'osm:node/1', 'time' => '11:15', 'keptRevision' => 'source:demo-new'],
                ['placeId' => 'osm:node/2', 'time' => '13:45'],
            ],
        ]);
        $trip = $this->actingAs($member)->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
            'userId' => $owner->id, 'source' => 'manual', 'name' => 'Forged',
            'points' => [['placeId' => 'osm:node/2', 'time' => '00:00', 'snapshot' => ['price' => 1]]],
        ])->assertOk()->json('data');
        $this->assertSame($room['title'], $trip['name']);
        $this->assertSame($room['date'], $trip['date']);
        $this->assertSame('room', $trip['source']);
        $this->assertSame(['osm:node/1', 'osm:node/2'], array_column($trip['points'], 'placeId'));
        $this->assertSame(['11:15', '13:45'], array_column($trip['points'], 'time'));
        $this->assertSame('TravelGo Demo 1', $trip['points'][0]['snapshot']['name']);
        $this->assertNull($trip['points'][0]['snapshot']['price']);
        $this->assertNull($trip['points'][0]['snapshot']['lat']);
        $this->assertSame(0, $trip['points'][1]['snapshot']['price']);
        $this->assertSame('source:demo-new', $trip['points'][0]['keptRevision']);
        $this->assertDatabaseHas('itineraries', ['id' => $trip['id'], 'user_id' => $member->id]);
        $this->assertEquals($room, $rooms->show($room['code'], $owner));
        $this->getJson('/api/itineraries/'.$trip['id'])->assertOk()->assertJsonPath('data', $trip);
    }

    public function test_members_have_separate_copies_and_personal_edits_never_change_the_room(): void
    {
        [$rooms, $room, $owner, $member] = $this->fixture();
        $mine = $this->actingAs($owner)->copy($room);
        $theirs = $this->actingAs($member)->copy($room);
        $this->assertNotSame($mine['id'], $theirs['id']);
        $this->getJson('/api/itineraries/'.$mine['id'])->assertNotFound();
        $this->putJson('/api/itineraries/'.$mine['id'], [...$mine, 'version' => 1])->assertNotFound();
        $this->deleteJson('/api/itineraries/'.$mine['id'])->assertNotFound();
        $edited = $this->putJson('/api/itineraries/'.$theirs['id'], [
            ...$theirs, 'version' => 1, 'name' => 'Bản riêng đã chỉnh', 'points' => array_reverse($theirs['points']),
        ])->assertOk()->assertJsonPath('data.source', 'room')->json('data');
        $this->assertSame('osm:node/1', $edited['points'][0]['placeId']);
        $this->assertEquals($room, $rooms->show($room['code'], $owner));
        $this->assertSame($edited, $this->copy($room));
        $this->assertDatabaseCount('itineraries', 2);
    }

    public function test_retries_reuse_a_copy_but_a_new_room_revision_or_deleted_copy_can_be_copied_again(): void
    {
        [$rooms, $room, $owner] = $this->fixture();
        $first = $this->actingAs($owner)->copy($room);
        $this->assertSame($first, $this->copy($room));
        $this->deleteJson('/api/itineraries/'.$first['id'])->assertNoContent();
        $this->assertDatabaseCount('itinerary_room_copies', 0);
        $second = $this->copy($room);
        $this->assertNotSame($first['id'], $second['id']);
        $changed = $rooms->itinerary($room['code'], $owner, [
            'revision' => $room['revision'], 'stops' => [['placeId' => 'osm:node/1', 'time' => '14:00']],
        ]);
        $this->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
        ])->assertConflict();
        $third = $this->copy($changed);
        $this->assertNotSame($second['id'], $third['id']);
        $this->assertSame('14:00', $third['points'][0]['time']);
        $this->assertCount(2, $second['points']);
        $this->assertDatabaseCount('itineraries', 2);
    }

    public function test_invalid_current_places_reject_the_whole_copy_without_changing_the_room(): void
    {
        [$rooms, $room, $owner] = $this->fixture();
        DB::table('places')->where('public_id', 'osm:node/1')->update(['city' => 'dalat']);
        $this->actingAs($owner)->postJson('/api/itineraries/from-room', [
            'roomCode' => $room['code'], 'roomRevision' => $room['revision'],
        ])->assertUnprocessable()->assertJsonValidationErrors('roomCode');
        $this->assertDatabaseCount('itineraries', 0);
        $this->assertDatabaseCount('itinerary_room_copies', 0);
        $this->assertEquals($room, $rooms->show($room['code'], $owner));
    }

    public function test_copy_rolls_back_header_stops_and_receipt_when_snapshot_write_fails(): void
    {
        [$rooms, $room, $owner] = $this->fixture();
        DB::table('places')->where('public_id', 'osm:node/1')->update(['price' => 80000]);
        ItineraryStop::updating(fn () => throw new RuntimeException('Simulated snapshot write failure'));
        try {
            app(RoomItineraryCopyService::class)->copy($owner->id, $room['code'], $room['revision']);
            $this->fail('Expected the snapshot write to fail.');
        } catch (RuntimeException $error) {
            $this->assertSame('Simulated snapshot write failure', $error->getMessage());
        } finally {
            ItineraryStop::flushEventListeners();
        }
        $this->assertDatabaseCount('itineraries', 0);
        $this->assertDatabaseCount('itinerary_stops', 0);
        $this->assertDatabaseCount('itinerary_room_copies', 0);
        $this->assertEquals($room, $rooms->show($room['code'], $owner));
    }
}
