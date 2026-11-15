<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class TripRoomsTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();
        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Room tests require the dedicated MySQL travelgo_test database.');
        }
        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS version', [], false);
        if ($server->db_name !== 'travelgo_test' || stripos($server->version, 'MariaDB') !== false) {
            throw new RuntimeException('Room tests must not migrate a development database or MariaDB.');
        }
    }

    private function place(int $number, string $city = 'hcm'): string
    {
        $id = 'osm:node/'.(9000000000 + $number);
        DB::table('places')->insert([
            'public_id' => $id, 'source' => 'demo', 'source_id' => (string) $number,
            'name' => 'TravelGo Demo '.$number, 'city' => $city, 'category' => 'food',
            'reference_only' => true,
        ]);

        return $id;
    }

    private function room(User $owner): array
    {
        return $this->actingAs($owner)->postJson('/api/rooms', [
            'title' => 'TravelGo Demo — Phòng thử', 'name' => 'Chủ phòng thử',
            'date' => '2026-12-01', 'desiredStops' => 3,
        ])->assertCreated()->json('data');
    }

    private function openRoom(User $owner, array $ids): array
    {
        $room = $this->room($owner);
        foreach ($ids as $id) {
            $this->postJson('/api/rooms/'.$room['code'].'/places', ['placeId' => $id])->assertOk();
        }

        return $this->postJson('/api/rooms/'.$room['code'].'/voting')->assertOk()->json('data');
    }

    public function test_every_room_endpoint_requires_a_real_authenticated_account(): void
    {
        foreach ([
            ['GET', '/api/rooms'], ['POST', '/api/rooms'], ['POST', '/api/rooms/join'],
            ['GET', '/api/rooms/AB123456'], ['POST', '/api/rooms/AB123456/places'],
            ['DELETE', '/api/rooms/AB123456/places'], ['POST', '/api/rooms/AB123456/voting'],
            ['PUT', '/api/rooms/AB123456/votes'], ['POST', '/api/rooms/AB123456/decision'],
            ['PUT', '/api/rooms/AB123456/itinerary'],
        ] as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }
    }

    public function test_guests_without_accept_headers_receive_json_401_instead_of_a_login_redirect(): void
    {
        $this->get('/api/rooms')->assertUnauthorized()->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_creation_uses_the_session_owner_and_unique_backend_invites(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $room = $this->actingAs($owner)->postJson('/api/rooms', [
            'title' => 'TravelGo Demo', 'date' => '', 'desiredStops' => 5,
            'ownerId' => (string) $stranger->id, 'code' => 'BADCODE1', 'activeMemberId' => (string) $stranger->id,
        ])->assertCreated()->json('data');
        $this->assertSame((string) $owner->id, $room['ownerId']);
        $this->assertSame((string) $owner->id, $room['activeMemberId']);
        $this->assertMatchesRegularExpression('/^[A-F0-9]{8}$/', $room['code']);
        $this->assertSame('', $room['date']);
        $this->assertSame([], $room['result']);
        $this->assertCount(1, $room['members']);
        $this->assertNotSame($room['code'], $this->room($owner)['code']);
        $this->assertDatabaseCount('trip_room_members', 2);
    }

    public function test_creation_rejects_invalid_titles_dates_and_stop_limits(): void
    {
        $this->actingAs(User::factory()->create());
        $valid = ['title' => 'TravelGo Demo', 'date' => null, 'desiredStops' => 3];
        foreach ([['title' => '   '], ['title' => str_repeat('x', 81)], ['date' => '2026-02-30'],
            ['desiredStops' => 0], ['desiredStops' => 6], ['desiredStops' => 1.5], ['name' => '']] as $invalid) {
            $this->postJson('/api/rooms', [...$valid, ...$invalid])->assertUnprocessable();
        }
        $this->assertDatabaseCount('trip_rooms', 0);
    }

    public function test_invite_join_is_idempotent_and_does_not_require_unique_display_names(): void
    {
        $room = $this->room($owner = User::factory()->create());
        $guest = User::factory()->create();
        $payload = ['code' => strtolower($room['code']), 'name' => 'Chủ phòng thử'];
        $this->actingAs($guest)->postJson('/api/rooms/join', $payload)->assertOk()
            ->assertJsonPath('data.activeMemberId', (string) $guest->id);
        $this->postJson('/api/rooms/join', $payload)->assertOk()->assertJsonCount(2, 'data.members');
        $this->assertDatabaseCount('trip_room_members', 2);
        $this->actingAs($owner)->getJson('/api/rooms/'.$room['code'])->assertOk()->assertJsonCount(2, 'data.members');
    }

    public function test_invite_errors_distinguish_invalid_unknown_and_full_rooms(): void
    {
        $room = $this->room(User::factory()->create());
        $this->actingAs(User::factory()->create())->postJson('/api/rooms/join', ['code' => 'invalid'])->assertUnprocessable();
        $this->postJson('/api/rooms/join', ['code' => '00000000'])->assertNotFound();
        for ($i = 0; $i < 11; $i++) {
            $this->actingAs(User::factory()->create())->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        }
        $this->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk()->assertJsonCount(12, 'data.members');
        $this->actingAs(User::factory()->create())->postJson('/api/rooms/join', ['code' => $room['code']])->assertConflict();
        $this->assertDatabaseCount('trip_room_members', 12);
    }

    public function test_nonmembers_cannot_read_or_mutate_and_their_list_excludes_the_room(): void
    {
        $room = $this->room(User::factory()->create());
        $this->actingAs(User::factory()->create())->getJson('/api/rooms')->assertOk()->assertJsonCount(0, 'data');
        foreach ([['GET', ''], ['POST', '/places'], ['DELETE', '/places'], ['POST', '/voting'],
            ['PUT', '/votes'], ['POST', '/decision'], ['PUT', '/itinerary']] as [$method, $suffix]) {
            $this->json($method, '/api/rooms/'.$room['code'].$suffix, [
                'placeId' => 'osm:node/1', 'placeIds' => ['osm:node/1'],
                'revision' => 1, 'stops' => [['placeId' => 'osm:node/1', 'time' => '08:00']],
            ])->assertForbidden();
        }
    }

    public function test_members_can_suggest_canonical_places_but_invalid_duplicate_and_non_hcm_ids_fail(): void
    {
        $room = $this->room(User::factory()->create());
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $uri = '/api/rooms/'.$room['code'].'/places';
        $id = $this->place(1);
        $this->postJson($uri, ['placeId' => $id])->assertOk()->assertJsonPath('data.places.0.placeId', $id);
        $this->postJson($uri, ['placeId' => $id])->assertUnprocessable();
        $this->postJson($uri, ['placeId' => 'osm:node/404'])->assertUnprocessable();
        $this->postJson($uri, ['placeId' => $this->place(2, 'dalat')])->assertUnprocessable();
        $this->assertDatabaseCount('trip_room_places', 1);
    }

    public function test_proposals_are_limited_to_twelve_and_can_only_be_removed_by_owner_before_voting(): void
    {
        $room = $this->room($owner = User::factory()->create());
        $uri = '/api/rooms/'.$room['code'];
        for ($i = 1; $i <= 12; $i++) {
            $this->postJson($uri.'/places', ['placeId' => $this->place($i)])->assertOk();
        }
        $this->postJson($uri.'/places', ['placeId' => $this->place(13)])->assertUnprocessable();
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->deleteJson($uri.'/places', ['placeId' => 'osm:node/9000000001'])->assertForbidden();
        $this->actingAs($owner)->deleteJson($uri.'/places', ['placeId' => 'osm:node/9000000001'])->assertOk();
        $this->postJson($uri.'/voting')->assertOk();
        $this->deleteJson($uri.'/places', ['placeId' => 'osm:node/9000000002'])->assertConflict();
        $this->postJson($uri.'/places', ['placeId' => 'osm:node/9000000013'])->assertConflict();
    }

    public function test_only_owner_opens_voting_with_at_least_one_valid_proposal(): void
    {
        $room = $this->room($owner = User::factory()->create());
        $uri = '/api/rooms/'.$room['code'];
        $this->postJson($uri.'/voting')->assertUnprocessable();
        $this->postJson($uri.'/places', ['placeId' => $this->place(1)])->assertOk();
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->postJson($uri.'/voting')->assertForbidden();
        $first = $this->actingAs($owner)->postJson($uri.'/voting')->assertOk()->json('data');
        $this->postJson($uri.'/voting')->assertOk()->assertJsonPath('data.revision', $first['revision']);
    }

    public function test_ballots_replace_only_the_authenticated_members_votes_and_allow_withdrawal(): void
    {
        $first = $this->place(1);
        $second = $this->place(2);
        $room = $this->openRoom($owner = User::factory()->create(), [$first, $second]);
        $uri = '/api/rooms/'.$room['code'];
        $this->putJson($uri.'/votes', ['placeIds' => [$first]])->assertOk();
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->putJson($uri.'/votes', ['placeIds' => [$second], 'memberId' => (string) $owner->id])->assertOk();
        $this->assertDatabaseCount('trip_room_votes', 2);
        $this->assertDatabaseHas('trip_room_votes', ['user_id' => $guest->id, 'place_id' => DB::table('places')->where('public_id', $second)->value('id')]);
        $this->putJson($uri.'/votes', ['placeIds' => [$first, $second]])->assertOk();
        $this->putJson($uri.'/votes', ['placeIds' => [$first, $second]])->assertOk();
        $this->assertDatabaseCount('trip_room_votes', 3);
        $this->putJson($uri.'/votes', ['placeIds' => []])->assertOk();
        $this->assertDatabaseCount('trip_room_votes', 1);
        $this->assertDatabaseHas('trip_room_votes', ['user_id' => $owner->id]);
    }

    public function test_ballots_reject_duplicates_unproposed_places_and_wrong_phase_atomically(): void
    {
        $first = $this->place(1);
        $second = $this->place(2);
        $room = $this->room($owner = User::factory()->create());
        $uri = '/api/rooms/'.$room['code'];
        $this->postJson($uri.'/places', ['placeId' => $first])->assertOk();
        $this->putJson($uri.'/votes', ['placeIds' => [$first]])->assertConflict();
        $this->postJson($uri.'/voting')->assertOk();
        $this->putJson($uri.'/votes', ['placeIds' => [$first]])->assertOk();
        $this->putJson($uri.'/votes', ['placeIds' => [$first, $first]])->assertUnprocessable();
        $this->putJson($uri.'/votes', ['placeIds' => [$first, $second]])->assertUnprocessable();
        $this->putJson($uri.'/votes', [])->assertUnprocessable();
        $this->assertDatabaseCount('trip_room_votes', 1);
    }

    public function test_only_owner_can_finalize_and_a_valid_ballot_is_required(): void
    {
        $id = $this->place(1);
        $room = $this->openRoom($owner = User::factory()->create(), [$id]);
        $uri = '/api/rooms/'.$room['code'];
        $this->postJson($uri.'/decision', ['placeIds' => [$id]])->assertUnprocessable();
        $this->putJson($uri.'/votes', ['placeIds' => [$id]])->assertOk();
        $this->postJson($uri.'/decision', ['placeIds' => []])->assertUnprocessable();
        $this->postJson($uri.'/decision', ['placeIds' => [$id, $id]])->assertUnprocessable();
        $this->postJson($uri.'/decision', ['placeIds' => [$this->place(2)]])->assertUnprocessable();
        $this->postJson($uri.'/decision', ['placeIds' => array_map($this->place(...), range(3, 8))])->assertUnprocessable();
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->postJson($uri.'/decision', ['placeIds' => [$id]])->assertForbidden();
        $this->assertDatabaseHas('trip_rooms', ['code' => $room['code'], 'phase' => 'voting']);
    }

    public function test_final_decision_preserves_order_and_snapshot_and_is_immutable_on_retries(): void
    {
        $first = $this->place(1);
        $second = $this->place(2);
        $room = $this->openRoom($owner = User::factory()->create(), [$first, $second]);
        $uri = '/api/rooms/'.$room['code'];
        $this->putJson($uri.'/votes', ['placeIds' => [$first]])->assertOk();
        $closed = $this->postJson($uri.'/decision', ['placeIds' => [$second, $first]])->assertOk()->json('data');
        $this->assertSame([$second, $first], array_column($closed['result'], 'placeId'));
        $this->assertSame(['08:00', '10:00'], array_column($closed['result'], 'time'));
        $this->assertNull($closed['result'][0]['snapshot']['price']);
        DB::table('places')->where('public_id', $first)->update(['name' => 'Tên mới']);
        $again = $this->postJson($uri.'/decision', ['placeIds' => [$first]])->assertOk()->json('data');
        $this->assertEquals($closed['result'], $again['result']);
        $this->assertSame($closed['revision'], $again['revision']);
        $this->putJson($uri.'/votes', ['placeIds' => [$second]])->assertConflict();
        $this->postJson($uri.'/voting')->assertConflict();
        $this->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->actingAs(User::factory()->create())->postJson('/api/rooms/join', ['code' => $room['code']])->assertConflict();
    }

    public function test_itinerary_edits_do_not_rewrite_the_decision_and_reject_stale_or_spoofed_updates(): void
    {
        $first = $this->place(1);
        $second = $this->place(2);
        $room = $this->openRoom($owner = User::factory()->create(), [$first, $second]);
        $uri = '/api/rooms/'.$room['code'];
        $guest = User::factory()->create();
        $this->actingAs($guest)->postJson('/api/rooms/join', ['code' => $room['code']])->assertOk();
        $this->actingAs($owner)->putJson($uri.'/votes', ['placeIds' => [$first]])->assertOk();
        $closed = $this->postJson($uri.'/decision', ['placeIds' => [$first, $second]])->assertOk()->json('data');
        $payload = ['revision' => $closed['revision'], 'stops' => [['placeId' => $second, 'time' => '09:15']]];
        $this->actingAs($guest)->putJson($uri.'/itinerary', $payload)->assertForbidden();
        $edited = $this->actingAs($owner)->putJson($uri.'/itinerary', $payload)->assertOk()->json('data');
        $this->assertEquals($closed['result'], $edited['result']);
        $this->assertSame($second, $edited['itinerary'][0]['placeId']);
        $this->assertSame('09:15', $edited['itinerary'][0]['time']);
        $this->putJson($uri.'/itinerary', $payload)->assertConflict();
        foreach ([[], [['placeId' => $first, 'time' => '25:00']],
            [['placeId' => $first, 'time' => '08:00', 'snapshot' => ['price' => 1]]],
            [['placeId' => $first, 'time' => '08:00'], ['placeId' => $first, 'time' => '10:00']]] as $invalid) {
            $this->putJson($uri.'/itinerary', ['revision' => $edited['revision'], 'stops' => $invalid])->assertUnprocessable();
        }
        $this->getJson($uri)->assertOk()->assertJsonPath('data.itinerary.0.time', '09:15');
    }

    public function test_a_ballot_for_a_place_outside_the_room_city_cannot_unlock_finalization(): void
    {
        $first = $this->place(1);
        $second = $this->place(2);
        $room = $this->openRoom($owner = User::factory()->create(), [$first, $second]);
        $uri = '/api/rooms/'.$room['code'];
        $this->putJson($uri.'/votes', ['placeIds' => [$first]])->assertOk();
        DB::table('places')->where('public_id', $first)->update(['city' => 'dalat']);
        $this->postJson($uri.'/decision', ['placeIds' => [$second]])->assertUnprocessable();
        $this->assertDatabaseHas('trip_rooms', ['code' => $room['code'], 'phase' => 'voting']);
    }

    public function test_payload_lists_reject_named_or_sparse_keys_without_changing_the_room(): void
    {
        $id = $this->place(1);
        $room = $this->openRoom($owner = User::factory()->create(), [$id]);
        $uri = '/api/rooms/'.$room['code'];
        $this->putJson($uri.'/votes', ['placeIds' => [$id]])->assertOk();
        foreach ([['first' => $id], [2 => $id]] as $invalid) {
            $this->putJson($uri.'/votes', ['placeIds' => $invalid])->assertUnprocessable();
            $this->postJson($uri.'/decision', ['placeIds' => $invalid])->assertUnprocessable();
        }
        $this->assertDatabaseCount('trip_room_votes', 1);
        $this->assertDatabaseHas('trip_rooms', ['code' => $room['code'], 'phase' => 'voting']);
        $closed = $this->postJson($uri.'/decision', ['placeIds' => [$id]])->assertOk()->json('data');
        foreach ([['first' => ['placeId' => $id, 'time' => '09:00']], [2 => ['placeId' => $id, 'time' => '09:00']]] as $invalid) {
            $this->putJson($uri.'/itinerary', ['revision' => $closed['revision'], 'stops' => $invalid])->assertUnprocessable();
        }
        $this->getJson($uri)->assertOk()->assertJsonPath('data.itinerary', null)
            ->assertJsonPath('data.revision', $closed['revision']);
    }

    public function test_unicode_whitespace_cannot_create_unreadable_room_or_member_labels(): void
    {
        $space = "\u{00A0}\u{FEFF}";
        $owner = User::factory()->create();
        $valid = ['title' => 'TravelGo Demo', 'date' => null, 'desiredStops' => 2];
        $this->actingAs($owner)->postJson('/api/rooms', [...$valid, 'title' => $space])->assertUnprocessable();
        $this->postJson('/api/rooms', [...$valid, 'name' => $space])->assertUnprocessable();
        $badProfile = User::factory()->create(['name' => $space]);
        $this->actingAs($badProfile)->postJson('/api/rooms', $valid)->assertUnprocessable();
        $this->assertDatabaseCount('trip_rooms', 0);
        $room = $this->room($owner);
        $this->actingAs($badProfile)->postJson('/api/rooms/join', ['code' => $room['code']])->assertUnprocessable();
        $this->postJson('/api/rooms/join', ['code' => $room['code'], 'name' => $space])->assertUnprocessable();
        $this->assertDatabaseCount('trip_room_members', 1);
        $this->postJson('/api/rooms/join', ['code' => $room['code'], 'name' => str_repeat("\u{1F600}", 40)])
            ->assertOk()->assertJsonCount(2, 'data.members');
    }

    public function test_mysql_constraints_prevent_duplicate_members_and_nonmember_ballots(): void
    {
        $placeId = $this->place(1);
        $room = $this->openRoom($owner = User::factory()->create(), [$placeId]);
        $roomId = DB::table('trip_rooms')->where('code', $room['code'])->value('id');
        try {
            DB::table('trip_room_members')->insert(['room_id' => $roomId, 'user_id' => $owner->id, 'display_name' => 'Duplicate']);
            $this->fail('Duplicate room membership must be rejected.');
        } catch (QueryException $error) {
            $this->assertSame(1062, $error->errorInfo[1]);
        }
        $this->expectException(QueryException::class);
        DB::table('trip_room_votes')->insert([
            'room_id' => $roomId, 'user_id' => User::factory()->create()->id,
            'place_id' => DB::table('places')->where('public_id', $placeId)->value('id'),
        ]);
    }
}
