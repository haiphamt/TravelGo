<?php

namespace Tests\Feature;

use App\Contracts\ItinerarySuggestionProvider;
use App\Models\ItineraryStop;
use App\Models\User;
use App\Services\ItineraryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class ItinerariesTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();
        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' || $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Itinerary tests require the dedicated MySQL travelgo_test schema.');
        }
        $actual = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);
        if ($actual->db_name !== 'travelgo_test' || stripos($actual->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Refusing to refresh an unexpected database.');
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        foreach ([['osm:node/123', false], ['tg-place-11111111-1111-4111-8111-111111111111', false], ['tg-local-22222222-2222-4222-8222-222222222222', true]] as $i => [$id, $local]) {
            DB::table('places')->insert([
                'public_id' => $id, 'source' => 'demo', 'source_id' => 'itinerary-'.$i,
                'name' => 'TravelGo Demo Coffee '.$i, 'city' => 'hcm', 'category' => 'coffee', 'local' => $local,
                'area' => 'Quận 1', 'lat' => 10.77, 'lng' => 106.69,
            ]);
        }
    }

    private function draft(array $changes = []): array
    {
        return array_replace([
            'name' => 'Chuyến đi minh họa', 'date' => '2026-12-01', 'endDate' => '2026-12-02',
            'budget' => null, 'note' => 'Dữ liệu demo', 'source' => 'manual',
            'points' => [
                ['placeId' => 'osm:node/123', 'time' => '09:00', 'date' => '2026-12-01'],
                ['placeId' => 'tg-place-11111111-1111-4111-8111-111111111111', 'time' => '11:00', 'estimatedCost' => 0],
            ],
        ], $changes);
    }

    private function suggestion(): array
    {
        return ['needs' => 'cà phê', 'area' => '', 'count' => 3, 'includeLocal' => true, 'requested' => [], 'startDate' => '2026-12-01', 'endDate' => '2026-12-03'];
    }

    public function test_browser_fixture_login_is_not_registered_in_application_routes(): void
    {
        $this->postJson('/__itinerary_test/login', ['account' => 'a'])->assertNotFound();
    }

    public function test_anonymous_requests_never_access_or_create_itineraries(): void
    {
        $this->getJson('/api/itineraries')->assertUnauthorized();
        $this->postJson('/api/itineraries', $this->draft())->assertUnauthorized();
        $this->postJson('/api/itineraries/suggestions', $this->suggestion())->assertUnauthorized();
        $this->assertDatabaseCount('itineraries', 0);
    }

    public function test_create_reload_reorder_update_and_delete_use_the_authenticated_owner(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $this->actingAs($owner);
        $saved = $this->postJson('/api/itineraries', $this->draft(['user_id' => $other->id]))
            ->assertCreated()->assertJsonPath('data.points.0.placeId', 'osm:node/123')
            ->assertJsonPath('data.budget', null)->assertJsonPath('data.points.1.estimatedCost', 0)->json('data');
        $this->assertDatabaseHas('itineraries', ['id' => $saved['id'], 'user_id' => $owner->id]);
        $this->getJson('/api/itineraries/'.$saved['id'])->assertOk()->assertJsonPath('data', $saved);
        $this->getJson('/api/itineraries')->assertOk()->assertJsonCount(1, 'data');
        $points = array_reverse($saved['points']);
        $changed = $this->putJson('/api/itineraries/'.$saved['id'], $this->draft(['version' => 1, 'points' => $points]))
            ->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.points.0.placeId', $points[0]['placeId'])->json('data');
        $this->getJson('/api/itineraries/'.$saved['id'])->assertOk()->assertJsonPath('data', $changed);
        $this->deleteJson('/api/itineraries/'.$saved['id'])->assertNoContent();
        $this->assertDatabaseCount('itinerary_stops', 0);
    }

    public function test_two_accounts_cannot_read_update_or_delete_each_others_trips(): void
    {
        $this->actingAs(User::factory()->create());
        $id = $this->postJson('/api/itineraries', $this->draft())->assertCreated()->json('data.id');
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/itineraries')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/itineraries/'.$id)->assertNotFound();
        $this->putJson('/api/itineraries/'.$id, $this->draft(['version' => 1]))->assertNotFound();
        $this->deleteJson('/api/itineraries/'.$id)->assertNotFound();
        $this->assertDatabaseCount('itineraries', 1);
    }

    public function test_invalid_dates_times_costs_duplicates_limits_and_unknown_places_are_rejected(): void
    {
        $this->actingAs(User::factory()->create());
        $base = $this->draft();
        $invalid = [
            ['date' => '2026-02-30'], ['endDate' => '2026-11-01'], ['budget' => -1], ['budget' => 1.5],
            ['points' => []], ['points' => array_fill(0, 6, $base['points'][0])],
            ['points' => [$base['points'][0], $base['points'][0]]],
            ['points' => [array_replace($base['points'][0], ['time' => '24:00'])]],
            ['points' => [array_replace($base['points'][0], ['date' => '2027-01-01'])]],
            ['points' => [array_replace($base['points'][0], ['estimatedCost' => -1])]],
            ['points' => [array_replace($base['points'][0], ['placeId' => 'osm:way/9999'])]],
            ['points' => [array_replace($base['points'][0], ['placeId' => 'osm:node/123/extra'])]],
            ['name' => '   '], ['cover' => 'data:image/png;base64,bm90YW5pbWFnZQ=='],
        ];
        foreach ($invalid as $changes) {
            $this->postJson('/api/itineraries', $this->draft($changes))->assertUnprocessable();
        }
        $this->assertDatabaseCount('itineraries', 0);
    }

    public function test_stale_edits_are_rejected_and_client_snapshots_cannot_overwrite_saved_facts(): void
    {
        $this->actingAs(User::factory()->create());
        $saved = $this->postJson('/api/itineraries', $this->draft())->assertCreated()->json('data');
        DB::table('places')->where('public_id', 'osm:node/123')->update(['name' => 'Updated approved name']);
        $points = $saved['points'];
        $points[0]['snapshot']['name'] = 'Forged client name';
        $this->putJson('/api/itineraries/'.$saved['id'], $this->draft(['version' => 1, 'points' => $points]))
            ->assertOk()->assertJsonPath('data.points.0.snapshot.name', 'TravelGo Demo Coffee 0');
        $this->putJson('/api/itineraries/'.$saved['id'], $this->draft(['version' => 1]))->assertConflict();
        $this->assertDatabaseHas('itineraries', ['id' => $saved['id'], 'version' => 2]);
    }

    public function test_a_failed_stop_write_rolls_back_the_entire_update(): void
    {
        $owner = User::factory()->create();
        $service = app(ItineraryService::class);
        $trip = $service->save($owner->id, $this->draft());
        $before = $service->payload($trip);
        $written = 0;
        ItineraryStop::creating(function () use (&$written) {
            if (++$written === 2) {
                throw new RuntimeException('Simulated disk/database write failure');
            }
        });
        try {
            $service->save($owner->id, $this->draft(['name' => 'Must roll back', 'version' => 1]), $trip->id);
            $this->fail('The simulated failure was not reached');
        } catch (RuntimeException $error) {
            $this->assertSame('Simulated disk/database write failure', $error->getMessage());
        } finally {
            ItineraryStop::flushEventListeners();
        }
        $this->assertSame($before, $service->payload($trip->refresh()));
    }

    public function test_preview_uses_real_ids_dates_and_mock_label_without_saving(): void
    {
        $this->actingAs(User::factory()->create());
        $result = $this->postJson('/api/itineraries/suggestions', $this->suggestion())->assertOk()
            ->assertJsonPath('data.source', 'ai-demo')->assertJsonCount(3, 'data.points')->json('data');
        $this->assertStringContainsString('mô phỏng', $result['notice']);
        $this->assertSame(['2026-12-01', '2026-12-02', '2026-12-03'], array_column($result['points'], 'date'));
        foreach ($result['points'] as $point) {
            $this->assertDatabaseHas('places', ['public_id' => $point['placeId']]);
        }
        $this->assertDatabaseCount('itineraries', 0);
        $this->postJson('/api/itineraries', $this->draft(['points' => $result['points'], 'endDate' => '2026-12-03', 'source' => 'ai-demo']))->assertCreated();
    }

    public function test_suggestion_rejects_empty_catalog_invalid_ids_duplicates_and_provider_failures(): void
    {
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/itineraries/suggestions', array_replace($this->suggestion(), ['area' => 'Không có khu vực này']))->assertUnprocessable();
        foreach ([['osm:node/does-not-exist'], ['osm:node/123', 'osm:node/123']] as $invalid) {
            $fake = $this->mock(ItinerarySuggestionProvider::class);
            $fake->shouldReceive('suggest')->once()->andReturn($invalid);
            $this->postJson('/api/itineraries/suggestions', $this->suggestion())->assertStatus(502);
        }
        $fake = $this->mock(ItinerarySuggestionProvider::class);
        $fake->shouldReceive('suggest')->once()->andThrow(new RuntimeException('Simulated provider timeout'));
        $this->postJson('/api/itineraries/suggestions', $this->suggestion())->assertStatus(503);
        $this->assertDatabaseCount('itineraries', 0);
    }

    public function test_suggestion_respects_local_preference_and_missing_coordinates(): void
    {
        $this->actingAs(User::factory()->create());
        DB::table('places')->where('public_id', 'osm:node/123')->update(['lat' => null]);
        $result = $this->postJson('/api/itineraries/suggestions', array_replace($this->suggestion(), ['includeLocal' => false]))
            ->assertOk()->assertJsonCount(1, 'data.points')->json('data.points');
        $this->assertSame('tg-place-11111111-1111-4111-8111-111111111111', $result[0]['placeId']);
    }
}
