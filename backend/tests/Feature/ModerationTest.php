<?php

namespace Tests\Feature;

use App\Models\Contribution;
use App\Models\User;
use App\Services\Moderation\ModerationCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class ModerationTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();
        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' || $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Moderation tests require the dedicated MySQL travelgo_test schema.');
        }
        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);
        if ($server->db_name !== 'travelgo_test' || stripos($server->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Moderation tests require MySQL travelgo_test, not MariaDB.');
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-15T08:00:00Z'));
    }

    public function test_private_endpoints_require_session_and_ignore_forged_identity(): void
    {
        $this->getJson('/api/contributions')->assertUnauthorized();
        $this->postJson('/api/contributions', $this->newDraft() + ['user_id' => 1, 'role' => 'admin'])->assertUnauthorized();
        $user = User::factory()->create();
        $data = $this->actingAs($user)->postJson('/api/contributions', $this->newDraft() + ['actor' => 'admin', 'user_id' => 999, 'status' => 'approved'])->assertCreated()->json('data');
        $this->assertDatabaseHas('contributions', ['id' => $data['id'], 'user_id' => $user->id, 'actor' => 'user', 'status' => 'pending']);
        $this->getJson('/api/moderation/queue')->assertForbidden();
    }

    public function test_new_place_only_appears_after_approval_and_keeps_its_assigned_public_id(): void
    {
        $user = User::factory()->create();
        $item = $this->actingAs($user)->postJson('/api/contributions', $this->newDraft())->assertCreated()->json('data');
        $this->assertMatchesRegularExpression('/^tg-place-[0-9a-f-]{36}$/', $item['placeId']);
        $this->assertDatabaseCount('places', 0);
        $admin = $this->admin();
        $this->actingAs($admin)->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk()->assertJsonPath('data.version', 2);
        $this->assertDatabaseHas('places', ['public_id' => $item['placeId'], 'name' => 'TravelGo Demo Quán', 'lat' => null, 'price' => null]);
        $this->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertConflict();
        $this->assertDatabaseCount('places', 1);
        $this->assertDatabaseCount('moderation_events', 2);
        $this->assertDatabaseHas('moderation_events', ['user_id' => $admin->id, 'actor' => 'admin', 'status' => 'approved', 'reason' => 'Đã đối chiếu.']);
    }

    public function test_author_isolation_resubmission_and_withdrawal_state_machine(): void
    {
        $author = User::factory()->create();
        $other = User::factory()->create();
        $item = $this->actingAs($author)->postJson('/api/contributions', $this->newDraft())->json('data');
        $this->actingAs($other)->getJson('/api/contributions/'.$item['id'])->assertNotFound();
        $this->getJson('/api/contributions')->assertJsonPath('meta.total', 0);
        $this->postJson('/api/contributions/'.$item['id'].'/withdraw', ['expectedVersion' => 1])->assertForbidden();
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision('needs-info'))->assertOk();
        $this->actingAs($author)->putJson('/api/contributions/'.$item['id'], $this->newDraft() + ['expectedVersion' => 1])->assertConflict();
        $this->putJson('/api/contributions/'.$item['id'], $this->newDraft() + ['expectedVersion' => 2])->assertOk()->assertJsonPath('data.version', 3);
        $this->postJson('/api/contributions/'.$item['id'].'/withdraw', ['expectedVersion' => 3])->assertOk();
        $this->postJson('/api/contributions/'.$item['id'].'/withdraw', ['expectedVersion' => 4])->assertConflict();
        $this->putJson('/api/contributions/'.$item['id'], $this->newDraft() + ['expectedVersion' => 4])->assertConflict();
    }

    public function test_invalid_data_coordinates_and_forged_image_are_rejected(): void
    {
        $this->actingAs(User::factory()->create());
        foreach ([['name' => ''], ['lat' => 91, 'lng' => 106], ['lat' => null, 'lng' => 106], ['category' => 'all'], ['price' => -1],
            ['photo' => ['dataUrl' => 'data:image/png;base64,'.base64_encode('not an image'), 'credit' => 'Demo', 'rightsConfirmed' => true]]] as $invalid) {
            $draft = $this->newDraft();
            $draft['patch'] = [...$draft['patch'], ...$invalid];
            $this->postJson('/api/contributions', $draft)->assertUnprocessable();
        }
        $this->assertDatabaseCount('contributions', 0);
    }

    public function test_claim_grant_is_scoped_and_revocation_rejects_pending_owner_work(): void
    {
        $place = $this->place();
        $otherPlace = $this->place('osm:way/123');
        $owner = User::factory()->create();
        $claim = $this->grant($owner, $place);
        $this->actingAs($owner)->getJson('/api/owner/grants')->assertJsonPath('data.0.placeId', $place->public_id)->assertJsonCount(1, 'data');
        $draft = $this->updateDraft($otherPlace) + ['context' => 'owner'];
        $this->postJson('/api/contributions', $draft)->assertForbidden();
        $pending = $this->postJson('/api/contributions', $this->updateDraft($place) + ['context' => 'owner'])->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$claim['id'].'/decision', $this->decision('revoked', 2))->assertOk();
        $this->assertDatabaseHas('contributions', ['id' => $pending['id'], 'status' => 'rejected', 'version' => 2]);
        $this->actingAs($owner)->getJson('/api/owner/grants')->assertJsonCount(0, 'data');
        $this->postJson('/api/contributions', $this->updateDraft($place) + ['context' => 'owner'])->assertForbidden();
    }

    public function test_duplicate_claims_and_non_admin_decisions_are_rejected(): void
    {
        $place = $this->place();
        $claim = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $this->claimDraft($place))->assertCreated()->json('data');
        $this->actingAs(User::factory()->create())->postJson('/api/contributions', $this->claimDraft($place))->assertConflict();
        $this->postJson('/api/moderation/'.$claim['id'].'/decision', $this->decision())->assertForbidden();
    }

    public function test_stale_place_conflict_does_not_write_history_or_public_data(): void
    {
        $place = $this->place();
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $this->updateDraft($place))->assertCreated()->json('data');
        DB::table('places')->where('id', $place->id)->update(['hours' => 'Nguồn đã đổi']);
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertConflict();
        $this->assertDatabaseHas('contributions', ['id' => $item['id'], 'status' => 'pending', 'version' => 1]);
        $this->assertDatabaseCount('moderation_events', 1);
        $this->assertDatabaseHas('places', ['id' => $place->id, 'name' => 'TravelGo Demo Cơ sở', 'hours' => 'Nguồn đã đổi']);
    }

    public function test_approval_rolls_back_public_write_if_history_cannot_be_saved(): void
    {
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $this->newDraft())->json('data');
        DB::connection()->beforeExecuting(function (string $sql) {
            if (str_starts_with($sql, 'insert into `moderation_events`')) {
                throw new RuntimeException('Simulated history storage failure.');
            }
        });
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertStatus(500);
        $this->assertDatabaseCount('places', 0);
        $this->assertDatabaseHas('contributions', ['id' => $item['id'], 'status' => 'pending', 'version' => 1]);
    }

    public function test_scheduled_temporary_move_activates_and_restores_at_boundaries(): void
    {
        $place = $this->place();
        $draft = $this->updateDraft($place);
        $draft['patch'] = ['lat' => 10.8, 'lng' => 106.7];
        $draft += ['hcmConfirmed' => true, 'change' => 'temporary-move', 'effectiveFrom' => '2026-11-15T16:00', 'effectiveUntil' => '2026-11-15T17:00'];
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $draft)->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'lat' => null]);
        $this->travelTo(CarbonImmutable::parse('2026-11-15T09:00:00Z'));
        $this->artisan('moderation:reconcile')->assertSuccessful();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'lat' => 10.8, 'lng' => 106.7]);
        $this->travelTo(CarbonImmutable::parse('2026-11-15T10:00:00Z'));
        $this->artisan('moderation:reconcile')->assertSuccessful();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'lat' => null, 'lng' => null, 'name' => $place->name]);
        $this->artisan('moderation:reconcile')->assertSuccessful();
    }

    public function test_report_targets_stable_photo_id_and_rejects_stale_review(): void
    {
        $place = $this->place();
        [$review, $photo] = $this->review($place);
        $author = User::factory()->create();
        $report = ['kind' => 'report', 'placeId' => $place->public_id, 'reason' => 'Ảnh không phù hợp.', 'reviewId' => $review->id,
            'reviewVersion' => CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString(), 'photoId' => $photo];
        $item = $this->actingAs($author)->postJson('/api/contributions', $report)->assertCreated()->json('data');
        $this->postJson('/api/contributions', $report)->assertConflict();
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision() + ['reportAction' => 'hide-photo'])->assertOk();
        $this->assertNotNull(DB::table('review_photos')->find($photo)->hidden_at);
        $this->assertNull(DB::table('reviews')->find($review->id)->hidden_at);
        $this->actingAs($author)->postJson('/api/contributions', array_diff_key($report, ['photoId' => true]))->assertCreated();
        $second = Contribution::query()->where('status', 'pending')->first();
        DB::table('reviews')->where('id', $review->id)->update(['text' => 'Bản mới', 'updated_at' => now()->addSecond()]);
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$second->id.'/decision', $this->decision() + ['reportAction' => 'hide-review'])->assertConflict();
        $this->assertNull(DB::table('reviews')->find($review->id)->hidden_at);
    }

    public function test_owner_reply_requires_current_grant_and_current_review_version(): void
    {
        $place = $this->place();
        [$review] = $this->review($place);
        $owner = User::factory()->create();
        $body = ['reviewVersion' => CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString(), 'text' => 'Cảm ơn bạn.'];
        $this->actingAs($owner)->putJson('/api/owner/reviews/'.$review->id.'/reply', $body)->assertForbidden();
        $claim = $this->grant($owner, $place);
        $this->actingAs($owner)->putJson('/api/owner/reviews/'.$review->id.'/reply', $body)->assertOk();
        $this->assertDatabaseHas('owner_replies', ['review_id' => $review->id, 'user_id' => $owner->id, 'text' => $body['text']]);
        $this->putJson('/api/owner/reviews/'.$review->id.'/reply', [...$body, 'reviewVersion' => 'outdated'])->assertConflict();
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$claim['id'].'/decision', $this->decision('revoked', 2))->assertOk();
        $this->actingAs($owner)->putJson('/api/owner/reviews/'.$review->id.'/reply', $body)->assertForbidden();
    }

    public function test_successive_permanent_edits_are_ordered_and_reconciliation_does_not_change_revision(): void
    {
        $place = $this->place();
        $user = User::factory()->create();
        $admin = $this->admin();
        foreach (['Tên thứ nhất', 'Tên thứ hai'] as $name) {
            $draft = $this->updateDraft($place);
            $draft['patch'] = ['name' => $name, 'products' => ['Món demo']];
            $item = $this->actingAs($user)->postJson('/api/contributions', $draft)->assertCreated()->json('data');
            $this->actingAs($admin)->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();
            $this->assertDatabaseHas('places', ['id' => $place->id, 'name' => $name]);
        }
        $before = DB::table('places')->find($place->id);
        $this->travel(10)->minutes();
        $this->artisan('moderation:reconcile')->assertSuccessful();
        $this->assertEquals($before, DB::table('places')->find($place->id));
    }

    public function test_pause_accepts_an_empty_patch_and_restores_the_previous_status(): void
    {
        $place = $this->place();
        $draft = [...$this->updateDraft($place), 'patch' => [], 'change' => 'pause', 'effectiveUntil' => '2026-11-15T16:00'];
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $draft)->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();
        $this->getJson('/api/moderation/place?id='.urlencode($place->public_id))->assertOk()->assertJsonPath('data.demoChange.status', 'paused');
        $this->travelTo(CarbonImmutable::parse('2026-11-15T09:00:00Z'));
        $this->artisan('moderation:reconcile')->assertSuccessful();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'moderation_status' => null]);
    }

    public function test_clearing_optional_description_preserves_unknown_data_as_null(): void
    {
        $place = $this->place();
        $draft = [...$this->updateDraft($place), 'patch' => ['description' => '']];
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $draft)->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'description' => null]);
    }

    public function test_source_edits_during_temporary_change_are_not_overwritten_on_expiry(): void
    {
        $place = $this->place();
        $draft = [...$this->updateDraft($place), 'change' => 'pause', 'effectiveUntil' => '2026-11-15T16:00'];
        $item = $this->actingAs(User::factory()->create())->postJson('/api/contributions', $draft)->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();
        DB::table('places')->where('id', $place->id)->update(['hours' => 'Nguồn ngoài đã đổi']);
        $this->travelTo(CarbonImmutable::parse('2026-11-15T09:00:00Z'));
        $this->artisan('moderation:reconcile')->assertFailed();
        $this->assertDatabaseHas('places', ['id' => $place->id, 'hours' => 'Nguồn ngoài đã đổi']);
    }

    public function test_keep_and_hide_review_decisions_change_only_the_reported_review(): void
    {
        $place = $this->place();
        [$review] = $this->review($place);
        $draft = ['kind' => 'report', 'placeId' => $place->public_id, 'reason' => 'Báo cáo demo.', 'reviewId' => $review->id,
            'reviewVersion' => CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString()];
        $user = User::factory()->create();
        $admin = $this->admin();
        foreach (['keep', 'hide-review'] as $action) {
            $item = $this->actingAs($user)->postJson('/api/contributions', $draft)->assertCreated()->json('data');
            $this->actingAs($admin)->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision() + ['reportAction' => $action])->assertOk();
            $this->getJson('/api/moderation/reviews?placeId='.urlencode($place->public_id))->assertJsonCount($action === 'keep' ? 1 : 0, 'data');
        }
    }

    public function test_reply_read_model_uses_server_photos_and_hides_replies_after_revocation(): void
    {
        $place = $this->place();
        [$review, $photo] = $this->review($place);
        $owner = User::factory()->create();
        $claim = $this->grant($owner, $place);
        $this->actingAs($owner)->putJson('/api/owner/reviews/'.$review->id.'/reply', [
            'reviewVersion' => CarbonImmutable::parse($review->updated_at, 'UTC')->toISOString(), 'text' => 'Cảm ơn.',
        ])->assertOk();
        $this->getJson('/api/moderation/reviews?placeId='.urlencode($place->public_id))
            ->assertJsonPath('data.0.photoIds.0', (string) $photo)->assertJsonPath('data.0.reply.text', 'Cảm ơn.');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$claim['id'].'/decision', $this->decision('revoked', 2))->assertOk();
        $this->getJson('/api/moderation/reviews?placeId='.urlencode($place->public_id))->assertJsonPath('data.0.reply', null);
    }

    public function test_web_middleware_rejects_csrf_less_writes_outside_the_test_bypass(): void
    {
        $user = User::factory()->create();
        $this->app['env'] = 'local';
        try {
            $this->actingAs($user)->postJson('/api/contributions', $this->newDraft())->assertStatus(419);
            $this->withSession(['_token' => 'csrf-test-only'])->postJson('/api/contributions', $this->newDraft(), ['X-CSRF-TOKEN' => 'csrf-test-only'])->assertCreated();
        } finally {
            $this->app['env'] = 'testing';
        }
    }

    private function admin(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['role' => 'admin'])->save();

        return $user;
    }

    private function newDraft(): array
    {
        return ['kind' => 'new', 'reason' => 'Khảo sát demo.', 'hcmConfirmed' => true,
            'patch' => ['name' => 'TravelGo Demo Quán', 'area' => 'Địa chỉ demo TP.HCM', 'category' => 'food']];
    }

    private function decision(string $decision = 'approved', int $version = 1): array
    {
        return ['decision' => $decision, 'expectedVersion' => $version, 'reason' => 'Đã đối chiếu.'];
    }

    private function place(string $id = 'osm:node/123'): object
    {
        $key = DB::table('places')->insertGetId(['public_id' => $id, 'source' => 'demo', 'source_id' => $id,
            'name' => 'TravelGo Demo Cơ sở', 'city' => 'hcm', 'category' => 'food', 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('places')->find($key);
    }

    private function updateDraft(object $place): array
    {
        return ['kind' => 'update', 'placeId' => $place->public_id, 'reason' => 'Khảo sát demo.',
            'expectedRevision' => app(ModerationCatalog::class)->revision(DB::table('places')->find($place->id)), 'patch' => ['name' => 'Tên demo mới']];
    }

    private function claimDraft(object $place): array
    {
        return ['kind' => 'claim', 'placeId' => $place->public_id, 'reason' => 'Xin quản lý demo.',
            'relationship' => 'owner', 'evidence' => 'Minh chứng tự tạo cho test.', 'agreement' => true];
    }

    private function grant(User $owner, object $place): array
    {
        $item = $this->actingAs($owner)->postJson('/api/contributions', $this->claimDraft($place))->assertCreated()->json('data');
        $this->actingAs($this->admin())->postJson('/api/moderation/'.$item['id'].'/decision', $this->decision())->assertOk();

        return $item;
    }

    private function review(object $place): array
    {
        $reviewId = DB::table('reviews')->insertGetId(['user_id' => User::factory()->create()->id, 'place_id' => $place->id,
            'rating' => 4, 'text' => 'Đánh giá demo.', 'created_at' => now(), 'updated_at' => now()]);
        $photo = DB::table('review_photos')->insertGetId(['review_id' => $reviewId, 'path' => 'demo/photo.png', 'mime' => 'image/png', 'position' => 0]);

        return [DB::table('reviews')->find($reviewId), $photo];
    }
}
