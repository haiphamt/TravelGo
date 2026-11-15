<?php

namespace Tests\Feature;

use App\Models\Place;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class PlaceEngagementTest extends TestCase
{
    use DatabaseMigrations;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();

        if (! app()->environment('testing') ||
            $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Engagement tests require the dedicated MySQL travelgo_test database.');
        }

        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);

        if ($server->db_name !== 'travelgo_test' || stripos($server->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Engagement tests require travelgo_test on MySQL, not MariaDB.');
        }
    }

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_private_endpoints_require_an_authenticated_session(): void
    {
        $place = Place::factory()->create();
        $this->getJson('/api/favorites')->assertUnauthorized();
        $this->putJson('/api/favorites', ['placeId' => $place->public_id])->assertUnauthorized();
        $this->deleteJson('/api/favorites', ['placeId' => $place->public_id])->assertUnauthorized();
        $this->getJson($this->reviewUrl('/api/reviews/mine', $place))->assertUnauthorized();
        $this->postJson('/api/reviews', $this->payload($place))->assertUnauthorized();
        $this->putJson('/api/reviews/1', $this->payload($place))->assertUnauthorized();
        $this->deleteJson('/api/reviews/1')->assertUnauthorized();
        $this->assertDatabaseCount('favorites', 0);
        $this->assertDatabaseCount('reviews', 0);
    }

    public function test_favorites_are_idempotent_and_scoped_to_the_current_account(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $place = Place::factory()->create(['public_id' => 'osm:way/5922616527']);
        $other = Place::factory()->create();

        $this->actingAs($alice)->putJson('/api/favorites', [
            'placeId' => $place->public_id, 'user_id' => $bob->id,
        ])->assertUnprocessable();
        $this->assertDatabaseCount('favorites', 0);
        $this->putJson('/api/favorites', ['placeId' => $place->public_id])->assertOk()->assertExactJson(['data' => [$place->public_id]]);
        $this->putJson('/api/favorites', ['placeId' => $place->public_id])->assertOk();
        $this->assertDatabaseCount('favorites', 1);
        $this->assertDatabaseHas('favorites', ['user_id' => $alice->id, 'place_id' => $place->id]);

        $this->actingAs($bob)->getJson('/api/favorites')->assertOk()->assertExactJson(['data' => []]);
        $this->putJson('/api/favorites', ['placeId' => $other->public_id])->assertOk()
            ->assertExactJson(['data' => [$other->public_id]]);
        $this->deleteJson('/api/favorites', ['placeId' => $place->public_id])->assertOk()
            ->assertExactJson(['data' => [$other->public_id]]);
        $this->assertDatabaseHas('favorites', ['user_id' => $alice->id, 'place_id' => $place->id]);

        $this->actingAs($alice)->deleteJson('/api/favorites', ['placeId' => $place->public_id])->assertOk()
            ->assertExactJson(['data' => []]);
        $this->deleteJson('/api/favorites', ['placeId' => $place->public_id])->assertOk();
        $this->assertDatabaseCount('favorites', 1);
    }

    public function test_favorite_validation_does_not_create_or_remove_unrelated_records(): void
    {
        $this->actingAs(User::factory()->create());
        $this->putJson('/api/favorites', [])->assertUnprocessable();
        $this->putJson('/api/favorites', ['placeId' => ['osm:node/1']])->assertUnprocessable();
        $this->putJson('/api/favorites', ['placeId' => 'osm:node/9999999999999'])->assertNotFound();
        $this->assertDatabaseCount('favorites', 0);
    }

    public function test_review_upsert_uses_session_author_and_keeps_one_record_per_account_place(): void
    {
        $place = Place::factory()->create();
        $alice = User::factory()->create(['name' => 'Tác giả thứ nhất']);
        $bob = User::factory()->create();
        $payload = $this->payload($place, ['user_id' => $bob->id, 'authorId' => (string) $bob->id]);

        $this->actingAs($alice)->postJson('/api/reviews', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('reviews', 0);
        $created = $this->postJson('/api/reviews', $this->payload($place))->assertSuccessful()
            ->assertJsonPath('data.placeId', $place->public_id)
            ->assertJsonPath('data.author.id', (string) $alice->id)
            ->assertJsonPath('data.author.name', $alice->name)
            ->assertJsonPath('data.visitedOn', null)
            ->assertJsonPath('data.photoIds', []);
        $id = $created->json('data.id');
        $this->assertIsString($id);

        $this->postJson('/api/reviews', $this->payload($place, ['rating' => 5, 'text' => 'Đã ghé lần nữa.']))
            ->assertSuccessful()->assertJsonPath('data.id', $id)->assertJsonPath('data.rating', 5);
        $this->assertDatabaseCount('reviews', 1);
        $this->assertDatabaseHas('reviews', [
            'id' => $id, 'user_id' => $alice->id, 'place_id' => $place->id, 'rating' => 5,
        ]);

        $this->getJson($this->reviewUrl('/api/reviews/mine', $place))->assertOk()->assertJsonPath('data.id', $id);
        $this->actingAs($bob)->getJson($this->reviewUrl('/api/reviews/mine', $place))
            ->assertOk()->assertExactJson(['data' => null]);
        $this->postJson('/api/reviews', $this->payload($place, ['rating' => 3]))->assertSuccessful();
        $this->assertDatabaseCount('reviews', 2);
    }

    public function test_other_accounts_cannot_edit_delete_or_move_an_authors_review(): void
    {
        $place = Place::factory()->create();
        $otherPlace = Place::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $created = $this->actingAs($alice)->postJson('/api/reviews', $this->payload($place))->assertSuccessful();
        $id = $created->json('data.id');

        $this->actingAs($bob)->putJson('/api/reviews/'.$id, $this->payload($place, ['rating' => 1]))->assertForbidden();
        $this->deleteJson('/api/reviews/'.$id)->assertForbidden();
        $this->assertDatabaseHas('reviews', ['id' => $id, 'user_id' => $alice->id, 'rating' => 4]);

        $this->actingAs($alice)->putJson('/api/reviews/'.$id, $this->payload($otherPlace))->assertUnprocessable();
        $this->assertDatabaseHas('reviews', ['id' => $id, 'place_id' => $place->id]);
    }

    #[DataProvider('invalidReviews')]
    public function test_invalid_review_values_are_rejected_without_writing(array $changes): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create())->postJson('/api/reviews', $this->payload($place, $changes))
            ->assertUnprocessable();
        $this->assertDatabaseCount('reviews', 0);
        $this->assertDatabaseCount('review_photos', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public static function invalidReviews(): array
    {
        $png = 'data:image/png;base64,'.self::PNG;

        return [
            'zero stars' => [['rating' => 0]],
            'six stars' => [['rating' => 6]],
            'fractional stars' => [['rating' => 2.5]],
            'missing stars' => [['rating' => null]],
            'long comment' => [['text' => str_repeat('đ', 501)]],
            'invalid date' => [['visitedOn' => '2026-02-30']],
            'four photos' => [['photos' => [$png, $png, $png, $png]]],
            'wrong photo array type' => [['photos' => $png]],
            'false image bytes' => [['photos' => ['data:image/png;base64,'.base64_encode('This is not an image.')]]],
            'mismatched declared mime' => [['photos' => ['data:image/jpeg;base64,'.self::PNG]]],
            'svg document' => [['photos' => ['data:image/svg+xml;base64,'.base64_encode('<svg xmlns="http://www.w3.org/2000/svg"/>')]]],
            'external photo url' => [['photos' => ['https://example.com/photo.png']]],
            'malformed base64' => [['photos' => ['data:image/png;base64,%%%']]],
            'traversal photo path' => [['photos' => ['/api/review-photos/../../.env']]],
        ];
    }

    public function test_future_visit_date_and_oversized_image_are_rejected(): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/reviews', $this->payload($place, ['visitedOn' => now()->addDay()->toDateString()]))
            ->assertUnprocessable();
        $oversized = base64_decode(self::PNG).str_repeat('x', 5 * 1024 * 1024);
        $this->postJson('/api/reviews', $this->payload($place, ['photos' => ['data:image/png;base64,'.base64_encode($oversized)]]))
            ->assertUnprocessable();
        $this->assertDatabaseCount('reviews', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_valid_limit_values_and_visit_date_round_trip_without_a_fabricated_date(): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $date = now()->subDay()->toDateString();
        $this->postJson('/api/reviews', $this->payload($place, [
            'rating' => 1, 'text' => str_repeat('đ', 500), 'visitedOn' => $date,
        ]))->assertSuccessful()->assertJsonPath('data.text', str_repeat('đ', 500))
            ->assertJsonPath('data.visitedOn', $date)->assertJsonPath('data.rating', 1);
    }

    public function test_uploaded_image_is_private_and_retaining_it_keeps_the_same_photo_id(): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $created = $this->postJson('/api/reviews', $this->payload($place, ['photos' => [$this->png()]]))
            ->assertSuccessful();
        $id = $created->json('data.id');
        $photoId = $created->json('data.photoIds.0');
        $url = $created->json('data.photos.0');
        $this->assertIsString($photoId);
        $this->assertSame('/api/review-photos/'.$photoId, $url);
        $path = DB::table('review_photos')->where('id', $photoId)->value('path');
        Storage::disk('local')->assertExists($path);
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/png');

        $this->putJson('/api/reviews/'.$id, $this->payload($place, ['text' => 'Sửa nội dung, giữ ảnh.', 'photos' => [$url]]))
            ->assertOk()->assertJsonPath('data.id', $id)->assertJsonPath('data.photoIds', [$photoId])
            ->assertJsonPath('data.photos', [$url]);
        $this->assertDatabaseCount('review_photos', 1);
        $this->assertSame([$path], Storage::disk('local')->allFiles());

        $this->getJson($this->reviewUrl('/api/reviews', $place))->assertOk()
            ->assertJsonMissingPath('data.0.author.email')->assertJsonMissingPath('data.0.path')
            ->assertJsonMissingPath('data.0.photos.0.path')->assertJsonPath('data.0.photos', [$url]);
        $this->get('/storage/'.$path)->assertForbidden();
    }

    public function test_a_photo_from_another_review_cannot_be_attached_and_a_failed_edit_keeps_old_data(): void
    {
        $first = Place::factory()->create();
        $second = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $created = $this->postJson('/api/reviews', $this->payload($first, ['photos' => [$this->png()]]))->assertSuccessful();
        $id = $created->json('data.id');
        $url = $created->json('data.photos.0');

        $this->postJson('/api/reviews', $this->payload($second, ['photos' => [$url]]))->assertUnprocessable();
        $this->putJson('/api/reviews/'.$id, $this->payload($first, ['text' => 'Không được lưu.', 'photos' => ['data:image/png;base64,eA==']]))
            ->assertUnprocessable();
        $this->assertDatabaseCount('reviews', 1);
        $this->assertDatabaseCount('review_photos', 1);
        $this->assertDatabaseHas('reviews', ['id' => $id, 'text' => 'Địa điểm đã ghé.']);
        $this->get($url)->assertOk();
    }

    public function test_removing_or_deleting_a_review_removes_its_photo_files(): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $created = $this->postJson('/api/reviews', $this->payload($place, ['photos' => [$this->png()]]))->assertSuccessful();
        $id = $created->json('data.id');
        $url = $created->json('data.photos.0');
        $path = DB::table('review_photos')->value('path');

        $this->putJson('/api/reviews/'.$id, $this->payload($place, ['photos' => []]))->assertOk()
            ->assertJsonPath('data.photos', [])->assertJsonPath('data.photoIds', []);
        Storage::disk('local')->assertMissing($path);
        $this->get($url)->assertNotFound();
        $this->assertDatabaseCount('review_photos', 0);

        $created = $this->postJson('/api/reviews', $this->payload($place, ['photos' => [$this->png()]]))->assertSuccessful();
        $path = DB::table('review_photos')->value('path');
        $url = $created->json('data.photos.0');
        $this->deleteJson('/api/reviews/'.$id)->assertOk()->assertExactJson(['data' => null]);
        $this->assertDatabaseCount('reviews', 0);
        $this->assertDatabaseCount('review_photos', 0);
        Storage::disk('local')->assertMissing($path);
        $this->get($url)->assertNotFound();
    }

    public function test_public_reviews_and_aggregates_exclude_hidden_records_and_individual_hidden_photos(): void
    {
        $place = Place::factory()->create();
        $visibleAuthor = User::factory()->create();
        $hiddenAuthor = User::factory()->create();
        $visible = $this->actingAs($visibleAuthor)->postJson('/api/reviews', $this->payload($place, [
            'rating' => 5, 'photos' => [$this->png(), $this->png()],
        ]))->assertSuccessful();
        $visiblePhotos = $visible->json('data.photoIds');
        DB::table('review_photos')->where('id', $visiblePhotos[0])->update(['hidden_at' => now()]);

        $hidden = $this->actingAs($hiddenAuthor)->postJson('/api/reviews', $this->payload($place, [
            'rating' => 1, 'photos' => [$this->png()],
        ]))->assertSuccessful();
        DB::table('reviews')->where('id', $hidden->json('data.id'))->update(['hidden_at' => now()]);
        $this->app['auth']->forgetGuards();

        $this->getJson($this->reviewUrl('/api/reviews', $place))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('summary.count', 1)->assertJsonPath('summary.average', 5)
            ->assertJsonPath('data.0.id', $visible->json('data.id'))
            ->assertJsonPath('data.0.photoIds', [$visiblePhotos[1]]);
        $this->getJson('/api/places/detail?'.http_build_query(['id' => $place->public_id]))
            ->assertOk()->assertJsonPath('data.reviewCount', 1)->assertJsonPath('data.rating', 5);
        $this->get('/api/review-photos/'.$visiblePhotos[0])->assertNotFound();
        $this->get('/api/review-photos/'.$visiblePhotos[1])->assertOk();
        $this->get('/api/review-photos/'.$hidden->json('data.photoIds.0'))->assertNotFound();

        $this->actingAs($hiddenAuthor)->getJson($this->reviewUrl('/api/reviews/mine', $place))->assertOk()
            ->assertJsonPath('data.id', $hidden->json('data.id'))->assertJsonPath('data.hidden', true);
    }

    public function test_public_review_pagination_is_stable_and_summary_covers_all_visible_reviews(): void
    {
        $place = Place::factory()->create();
        $ids = [];
        foreach ([1, 3, 5] as $rating) {
            $response = $this->actingAs(User::factory()->create())->postJson('/api/reviews', $this->payload($place, ['rating' => $rating]))
                ->assertSuccessful();
            $ids[] = $response->json('data.id');
        }
        DB::table('reviews')->update(['created_at' => '2026-01-01 00:00:00', 'updated_at' => '2026-01-01 00:00:00']);
        $this->app['auth']->forgetGuards();
        $first = $this->getJson($this->reviewUrl('/api/reviews', $place, ['per_page' => 2, 'page' => 1]))->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3)->assertJsonPath('summary.count', 3)
            ->assertJsonPath('summary.average', 3);
        $second = $this->getJson($this->reviewUrl('/api/reviews', $place, ['per_page' => 2, 'page' => 2]))->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('summary.count', 3)->assertJsonPath('summary.average', 3);
        $this->assertEqualsCanonicalizing($ids, [...array_column($first->json('data'), 'id'), ...array_column($second->json('data'), 'id')]);
        $this->getJson($this->reviewUrl('/api/reviews', $place, ['per_page' => 2, 'page' => 1]))->assertOk()
            ->assertJsonPath('data', $first->json('data'));
    }

    public function test_empty_review_summary_is_null_and_unknown_places_are_not_found(): void
    {
        $place = Place::factory()->create();
        $this->getJson($this->reviewUrl('/api/reviews', $place))->assertOk()
            ->assertJsonPath('data', [])->assertJsonPath('summary', ['count' => 0, 'average' => null]);
        $this->getJson('/api/reviews?placeId=osm%3Anode%2F9999999999999')->assertNotFound();
        $this->actingAs(User::factory()->create())->postJson('/api/reviews', $this->payload($place, [
            'placeId' => 'osm:node/9999999999999',
        ]))->assertNotFound();
    }

    public function test_repeat_upload_preserves_photo_ids_and_hide_decisions(): void
    {
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $payload = $this->payload($place, ['photos' => [$this->png()]]);
        $first = $this->postJson('/api/reviews', $payload)->assertOk();
        $photoId = $first->json('data.photoIds.0');
        DB::table('review_photos')->where('id', $photoId)->update(['hidden_at' => now()]);
        $this->postJson('/api/reviews', $payload)->assertOk()
            ->assertJsonPath('data.id', $first->json('data.id'))->assertJsonPath('data.photoIds', [$photoId]);
        $this->assertDatabaseCount('reviews', 1);
        $this->assertDatabaseCount('review_photos', 1);
        // Public serialization must filter the image even when its author is viewing.
        $this->getJson($this->reviewUrl('/api/reviews', $place))->assertOk()->assertJsonPath('data.0.photos', []);
        $this->getJson($this->reviewUrl('/api/reviews/mine', $place))->assertOk()->assertJsonPath('data.photoIds', [$photoId]);
    }

    public function test_visit_date_uses_the_ho_chi_minh_calendar_at_midnight(): void
    {
        $this->travelTo(Carbon::parse('2026-11-15T17:30:00Z'));
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/reviews', $this->payload($place, ['visitedOn' => '2026-11-16']))
            ->assertOk()->assertJsonPath('data.visitedOn', '2026-11-16');
        $this->postJson('/api/reviews', $this->payload($place, ['visitedOn' => '2026-11-17']))->assertUnprocessable();
        $this->travelBack();
    }

    public function test_photo_only_edit_advances_review_version_and_storage_failure_rolls_back(): void
    {
        $this->travelTo(Carbon::parse('2026-11-16T03:00:00Z'));
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create());
        $created = $this->postJson('/api/reviews', $this->payload($place))->assertOk();
        $this->travel(1)->seconds();
        $withPhoto = $this->postJson('/api/reviews', $this->payload($place, ['photos' => [$this->png()]]))->assertOk();
        $this->assertNotSame($created->json('data.updatedAt'), $withPhoto->json('data.updatedAt'));
        $this->travelBack();

        $disk = Storage::disk('local');
        // Fail a new write while preserving the already saved review and its image.
        $diskMock = \Mockery::mock($disk)->makePartial();
        $diskMock->shouldReceive('put')->andReturn(false);
        Storage::shouldReceive('disk')->with('local')->andReturn($diskMock);
        $different = 'data:image/png;base64,'.base64_encode(base64_decode(self::PNG).'different bytes');
        $this->postJson('/api/reviews', $this->payload($place, ['text' => 'Must not persist', 'photos' => [$different]]))->assertStatus(500);
        $this->assertDatabaseHas('reviews', ['id' => $created->json('data.id'), 'text' => 'Địa điểm đã ghé.']);
        $this->assertDatabaseCount('review_photos', 1);
        $this->get($withPhoto->json('data.photos.0'))->assertOk();
    }

    public function test_session_mutations_require_a_valid_csrf_token(): void
    {
        $this->app->bind(PreventRequestForgery::class,
            fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
            {
                protected function runningUnitTests()
                {
                    return false;
                }
            });
        $place = Place::factory()->create();
        $this->actingAs(User::factory()->create())->withSession(['_token' => str_repeat('a', 40)]);
        $this->getJson('/api/favorites')->assertOk()->assertCookie('XSRF-TOKEN');
        $this->putJson('/api/favorites', ['placeId' => $place->public_id])->assertStatus(419);
        $this->assertDatabaseCount('favorites', 0);
        $this->withHeader('X-CSRF-TOKEN', str_repeat('a', 40))
            ->putJson('/api/favorites', ['placeId' => $place->public_id])->assertOk();
    }

    private function payload(Place $place, array $changes = []): array
    {
        return array_replace([
            'placeId' => $place->public_id, 'rating' => 4, 'text' => 'Địa điểm đã ghé.',
            'visitedOn' => null, 'photos' => [],
        ], $changes);
    }

    private function png(): string
    {
        return 'data:image/png;base64,'.self::PNG;
    }

    private function reviewUrl(string $path, Place $place, array $parameters = []): string
    {
        return $path.'?'.http_build_query(['placeId' => $place->public_id, ...$parameters]);
    }
}
