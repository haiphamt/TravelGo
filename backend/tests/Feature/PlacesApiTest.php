<?php

namespace Tests\Feature;

use App\Models\Place;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class PlacesApiTest extends TestCase
{
    use DatabaseMigrations;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();

        if (! app()->environment('testing') ||
            $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Places API tests require the dedicated MySQL travelgo_test database.');
        }

        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);

        if ($server->db_name !== 'travelgo_test' || stripos($server->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Places API tests require travelgo_test on MySQL, not MariaDB.');
        }
    }

    public function test_public_catalog_is_empty_until_data_is_imported(): void
    {
        $this->getJson('/api/places')->assertOk()->assertExactJson([
            'data' => [],
            'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 24, 'total' => 0],
        ]);
    }

    public function test_search_matches_vietnamese_accents_d_stroke_products_and_address(): void
    {
        $place = Place::factory()->create([
            'name' => 'Quán Đường Phố',
            'products' => ['Cà phê sữa', 'Bánh mì'],
            'area' => 'Phường Bến Nghé, Quận 1',
        ]);
        Place::factory()->create(['name' => 'Một địa điểm khác']);

        foreach (['Đường Phố', 'DUONG PHO', 'ca phe sua', 'BÁNH MÌ', 'ben nghe', 'pho ca phe sua'] as $search) {
            $this->getJson($this->listUrl(['q' => $search]))->assertOk()
                ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $place->public_id);
        }
    }

    public function test_search_treats_sql_wildcards_as_literal_characters(): void
    {
        $place = Place::factory()->create(['name' => 'Quán 100%_đúng=giá']);
        Place::factory()->create(['name' => 'Quán 100 phần trăm']);

        $this->getJson($this->listUrl(['q' => '%_dung=gia']))->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $place->public_id);
    }

    public function test_discovery_combines_local_category_area_district_type_and_facet(): void
    {
        $match = Place::factory()->create([
            'name' => 'Cà phê đầu hẻm', 'local' => true, 'category' => 'coffee',
            'area' => '12 Đường Nguyễn Trãi', 'source_district' => 'Quận 1',
            'local_profile' => ['categoryLabel' => 'Xe đẩy'], 'facets' => ['takeaway', 'wifi'],
        ]);
        Place::factory()->create([
            'local' => false, 'category' => 'coffee', 'area' => $match->area,
            'source_district' => 'Quận 1', 'facets' => ['takeaway'],
        ]);
        Place::factory()->create([
            'local' => true, 'category' => 'coffee', 'area' => $match->area,
            'source_district' => 'Quận 3', 'local_profile' => ['categoryLabel' => 'Xe đẩy'],
            'facets' => ['takeaway'],
        ]);
        Place::factory()->create([
            'local' => true, 'category' => 'food', 'area' => $match->area,
            'source_district' => 'Quận 1', 'local_profile' => ['categoryLabel' => 'Xe đẩy'],
            'facets' => ['takeaway'],
        ]);

        $this->getJson($this->listUrl([
            'city' => 'hcm', 'q' => 'dau hem', 'category' => 'coffee', 'local' => '1',
            'area' => 'nguyen trai', 'district' => 'QUAN 1', 'localType' => 'Xe đẩy', 'facet' => 'takeaway',
        ]))->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $match->public_id);
    }

    public function test_local_type_implies_local_and_local_zero_selects_non_local(): void
    {
        $local = Place::factory()->create(['local' => true, 'local_profile' => ['categoryLabel' => 'Quán nhỏ']]);
        $regular = Place::factory()->create(['local' => false, 'local_profile' => ['categoryLabel' => 'Quán nhỏ']]);

        $this->getJson($this->listUrl(['localType' => 'Quán nhỏ']))->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $local->public_id);
        $this->getJson($this->listUrl(['local' => '0']))->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $regular->public_id);
    }

    public function test_image_filter_applies_before_paginating_a_category_and_facet(): void
    {
        $matching = ['category' => 'coffee', 'facets' => ['wifi']];
        Place::factory()->create($matching + ['image' => null]);
        Place::factory()->create($matching + ['image' => '']);
        $first = Place::factory()->create($matching + ['image' => '/images/osm/node-3.jpg']);
        Place::factory()->create($matching + ['image' => '/images/osm/node-4.jpg']);
        Place::factory()->create(['category' => 'coffee', 'facets' => [], 'image' => '/images/osm/node-5.jpg']);
        Place::factory()->create(['category' => 'food', 'facets' => ['wifi'], 'image' => '/images/osm/node-6.jpg']);

        $this->getJson($this->listUrl(['category' => 'coffee', 'facet' => 'wifi', 'has_image' => '1', 'per_page' => 1]))
            ->assertOk()->assertJsonPath('meta.total', 2)->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $first->public_id);
    }

    public function test_always_open_uses_confirmed_hours_and_unknown_address_is_not_an_area(): void
    {
        $open = Place::factory()->create(['hours' => '24/7', 'area' => null]);
        Place::factory()->create(['hours' => null, 'facets' => ['always-open'], 'area' => 'Chưa cập nhật địa chỉ']);

        $this->getJson($this->listUrl(['facet' => 'always-open']))->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $open->public_id);
        $this->getJson($this->listUrl(['area' => 'chua cap nhat']))->assertOk()->assertJsonPath('meta.total', 0);
    }

    public function test_missing_fields_remain_null_and_known_zero_is_returned_as_zero(): void
    {
        $unknown = Place::factory()->create(['public_id' => 'osm:node/5922616527']);
        $known = Place::factory()->create(['price' => 0, 'lat' => 0, 'lng' => 0]);

        $response = $this->getJson($this->detailUrl($unknown->public_id))->assertOk()
            ->assertJsonPath('data.id', 'osm:node/5922616527')
            ->assertJsonPath('data.images', [])->assertJsonPath('data.products', [])
            ->assertJsonPath('data.reviewCount', 0)->assertJsonPath('data.referenceOnly', true);
        foreach (['area', 'sourceDistrict', 'price', 'lat', 'lng', 'hours', 'image', 'photoCredit',
            'photoSource', 'description', 'localProfile', 'mobile', 'sourceUpdatedAt', 'updated', 'rating'] as $field) {
            $response->assertJsonPath('data.'.$field, null);
        }
        $response->assertJsonMissingPath('data.source_id')->assertJsonMissingPath('data.user_id');

        $this->getJson($this->detailUrl($known->public_id))->assertOk()
            ->assertJsonPath('data.price', 0)->assertJsonPath('data.lat', 0)->assertJsonPath('data.lng', 0);
    }

    public function test_source_attribution_and_local_profile_are_preserved(): void
    {
        $photoSource = ['url' => 'https://example.org/source', 'license' => 'CC BY 4.0', 'licenseUrl' => 'https://creativecommons.org/licenses/by/4.0/'];
        $profile = ['categoryLabel' => 'Quán nhỏ', 'hours' => ['summary' => null, 'qualityFlags' => ['unverified']]];
        $place = Place::factory()->create([
            'local' => true, 'source_url' => 'https://www.openstreetmap.org/node/123',
            'source_label' => 'OpenStreetMap', 'source_license' => 'ODbL',
            'image' => '/images/osm/node-123.jpg', 'images' => ['/images/osm/node-123.jpg'],
            'photo_credit' => 'Tác giả kiểm thử', 'photo_source' => $photoSource,
            'local_profile' => $profile, 'source_updated_at' => '2026-10-01 03:04:05.123456',
            'data_updated_at' => '2026-10-02 03:04:05.123456',
        ]);

        $this->getJson($this->detailUrl($place->public_id))->assertOk()
            ->assertJsonPath('data.photoSource', fn ($value) => $value == $photoSource)->assertJsonPath('data.localProfile', fn ($value) => $value == $profile)
            ->assertJsonPath('data.photoCredit', 'Tác giả kiểm thử')->assertJsonPath('data.sourceLicense', 'ODbL')
            ->assertJsonPath('data.sourceUrl', 'https://www.openstreetmap.org/node/123')
            ->assertJsonPath('data.sourceUpdatedAt', '2026-10-01T03:04:05.123456Z')
            ->assertJsonPath('data.updated', '2026-10-02T03:04:05.123456Z');
    }

    public function test_detail_uses_complete_opaque_ids_and_missing_places_return_404(): void
    {
        $ids = ['osm:node/123', 'osm:way/123', 'osm:relation/123', 'tg-local-37d7c541-b4e5-8d01-8bf7-e5dbc0466e1f', 'tg-place-5d2dcfa1-bb69-4de3-91f6-5f0b006f19af'];
        foreach ($ids as $id) {
            Place::factory()->create(['public_id' => $id]);
            $this->getJson($this->detailUrl($id))->assertOk()->assertJsonPath('data.id', $id);
        }
        $this->getJson($this->detailUrl('osm:node/999999'))->assertNotFound();
        $this->getJson($this->detailUrl('OSM:node/123'))->assertNotFound();
        $this->getJson('/api/places/detail')->assertUnprocessable()->assertJsonValidationErrors(['id']);
    }

    public function test_price_sort_is_stable_across_pages_and_null_prices_are_last(): void
    {
        $unknown = Place::factory()->create(['price' => null]);
        $first = Place::factory()->create(['price' => 10000]);
        $second = Place::factory()->create(['price' => 10000]);
        $free = Place::factory()->create(['price' => 0]);

        $this->getJson($this->listUrl(['sort' => 'price', 'per_page' => 2, 'page' => 1]))->assertOk()
            ->assertJsonPath('data.0.id', $free->public_id)->assertJsonPath('data.1.id', $first->public_id)
            ->assertJsonPath('meta', ['current_page' => 1, 'last_page' => 2, 'per_page' => 2, 'total' => 4]);
        $this->getJson($this->listUrl(['sort' => 'price', 'per_page' => 2, 'page' => 2]))->assertOk()
            ->assertJsonPath('data.0.id', $second->public_id)->assertJsonPath('data.1.id', $unknown->public_id);
        $this->getJson($this->listUrl(['sort' => 'price', 'per_page' => 2, 'page' => 3]))->assertOk()
            ->assertJsonPath('data', [])->assertJsonPath('meta.current_page', 3)->assertJsonPath('meta.total', 4);
    }

    public function test_name_ties_use_internal_id_and_default_prefers_attributed_photos(): void
    {
        $first = Place::factory()->create(['name' => 'A']);
        $second = Place::factory()->create(['name' => 'A', 'image' => '/images/osm/node-2.jpg']);
        $photo = Place::factory()->create([
            'name' => 'Z', 'image' => '/images/osm/node-3.jpg',
            'photo_source' => ['url' => 'https://example.org/source', 'license' => 'CC0', 'licenseUrl' => 'https://creativecommons.org/publicdomain/zero/1.0/'],
        ]);

        $this->getJson($this->listUrl(['sort' => 'name']))->assertOk()
            ->assertJsonPath('data.0.id', $first->public_id)->assertJsonPath('data.1.id', $second->public_id);
        $this->getJson('/api/places')->assertOk()->assertJsonPath('data.0.id', $photo->public_id)
            ->assertJsonPath('data.1.id', $second->public_id)->assertJsonPath('data.2.id', $first->public_id);
    }

    public function test_default_image_order_applies_to_local_results_before_pagination(): void
    {
        $noCover = Place::factory()->create(['local' => true]);
        $emptyCover = Place::factory()->create(['local' => true, 'image' => '']);
        $firstCover = Place::factory()->create(['local' => true, 'image' => '/images/local/first.webp']);
        $secondCover = Place::factory()->create(['local' => true, 'image' => '/images/local/second.webp']);

        $this->getJson($this->listUrl(['local' => 1, 'per_page' => 2, 'page' => 1]))->assertOk()
            ->assertJsonPath('data.0.id', $firstCover->public_id)->assertJsonPath('data.1.id', $secondCover->public_id);
        $this->getJson($this->listUrl(['local' => 1, 'per_page' => 2, 'page' => 2]))->assertOk()
            ->assertJsonPath('data.0.id', $noCover->public_id)->assertJsonPath('data.1.id', $emptyCover->public_id);
    }

    public function test_hidden_reviews_do_not_contribute_to_public_count_or_average(): void
    {
        $place = Place::factory()->create();
        foreach ([[5, null], [3, null], [1, now()]] as [$rating, $hidden]) {
            DB::table('reviews')->insert([
                'place_id' => $place->id, 'user_id' => User::factory()->create()->id,
                'rating' => $rating, 'text' => 'Đánh giá kiểm thử', 'visited_on' => null,
                'hidden_at' => $hidden, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->getJson($this->detailUrl($place->public_id))->assertOk()
            ->assertJsonPath('data.reviewCount', 2)->assertJsonPath('data.rating', 4);
        $this->getJson('/api/places')->assertOk()
            ->assertJsonPath('data.0.reviewCount', 2)->assertJsonPath('data.0.rating', 4);
    }

    #[DataProvider('invalidQueries')]
    public function test_invalid_filters_are_rejected_instead_of_silently_changing_the_query(array $query, string $field): void
    {
        $this->getJson($this->listUrl($query))->assertUnprocessable()->assertJsonValidationErrors([$field]);
    }

    public static function invalidQueries(): array
    {
        return [
            'page zero' => [['page' => 0], 'page'],
            'too many results' => [['per_page' => 201], 'per_page'],
            'unknown city' => [['city' => 'hanoi'], 'city'],
            'unknown category' => [['category' => 'invented'], 'category'],
            'unknown facet' => [['facet' => 'invented'], 'facet'],
            'unknown sort' => [['sort' => 'rating'], 'sort'],
            'array query' => [['q' => ['search']], 'q'],
            'oversized district' => [['district' => str_repeat('x', 81)], 'district'],
            'invalid local flag' => [['local' => 'maybe'], 'local'],
            'invalid image flag' => [['has_image' => 'maybe'], 'has_image'],
        ];
    }

    private function listUrl(array $query): string
    {
        return '/api/places?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    private function detailUrl(string $id): string
    {
        return '/api/places/detail?'.http_build_query(['id' => $id], '', '&', PHP_QUERY_RFC3986);
    }
}
