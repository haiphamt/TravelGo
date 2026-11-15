<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class PlacesSchemaTest extends TestCase
{
    use DatabaseMigrations;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();

        if (! app()->environment('testing') ||
            $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Places schema tests require the dedicated MySQL travelgo_test database.');
        }

        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);

        if ($server->db_name !== 'travelgo_test' || stripos($server->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Places schema tests require travelgo_test on MySQL, not MariaDB.');
        }
    }

    public function test_internal_id_supports_foreign_keys_and_public_ids_preserve_source_types(): void
    {
        $column = DB::table('information_schema.COLUMNS')
            ->where('TABLE_SCHEMA', 'travelgo_test')->where('TABLE_NAME', 'places')
            ->where('COLUMN_NAME', 'id')->first();

        $this->assertSame('bigint unsigned', $column->COLUMN_TYPE);
        $this->assertSame('auto_increment', $column->EXTRA);

        foreach (['node', 'way', 'relation'] as $type) {
            $this->insertPlace(['public_id' => "osm:{$type}/123", 'source_id' => "{$type}/123"]);
        }

        $this->insertPlace([
            'public_id' => 'tg-local-37d7c541-b4e5-8d01-8bf7-e5dbc0466e1f',
            'source' => 'community-local', 'source_id' => 'tg-local-37d7c541-b4e5-8d01-8bf7-e5dbc0466e1f', 'local' => true,
        ]);
        $this->insertPlace([
            'public_id' => 'tg-place-5d2dcfa1-bb69-4de3-91f6-5f0b006f19af',
            'source' => 'travelgo', 'source_id' => 'tg-place-5d2dcfa1-bb69-4de3-91f6-5f0b006f19af',
        ]);

        Schema::create('place_schema_references', function ($table) {
            $table->id();
            $table->foreignId('place_id')->constrained('places');
        });

        try {
            $id = DB::table('places')->where('public_id', 'osm:way/123')->value('id');
            DB::table('place_schema_references')->insert(['place_id' => $id]);
            $this->assertDatabaseCount('places', 5);
            $this->assertDatabaseHas('place_schema_references', ['place_id' => $id]);
        } finally {
            Schema::dropIfExists('place_schema_references');
        }
    }

    public function test_duplicate_public_id_is_rejected_even_with_another_source_key(): void
    {
        $this->insertPlace();

        $this->assertRejected(['source_id' => 'node/456'], 1062, 'places_public_id_unique');
    }

    public function test_duplicate_source_pair_is_rejected_even_with_another_public_id(): void
    {
        $this->insertPlace();

        $this->assertRejected(['public_id' => 'osm:node/456'], 1062, 'places_source_source_id_unique');
    }

    public function test_missing_details_remain_null_and_known_zero_is_distinct(): void
    {
        $id = $this->insertPlace();
        $place = DB::table('places')->find($id);

        foreach (['area', 'price', 'hours', 'lat', 'lng', 'image', 'source_district',
            'photo_credit', 'photo_source', 'local_profile', 'data_updated_at', 'source_updated_at'] as $field) {
            $this->assertNull($place->{$field}, $field);
        }

        $this->assertSame(1, $place->reference_only);
        $this->insertPlace(['public_id' => 'osm:way/456', 'source_id' => 'way/456', 'price' => 0, 'lat' => 0, 'lng' => null]);
        $this->assertDatabaseHas('places', ['public_id' => 'osm:way/456', 'price' => 0, 'lat' => 0, 'lng' => null]);
    }

    public function test_geographic_boundaries_are_valid(): void
    {
        $this->insertPlace(['lat' => -90, 'lng' => -180]);
        $this->insertPlace(['public_id' => 'osm:node/456', 'source_id' => 'node/456', 'lat' => 90, 'lng' => 180]);

        $this->assertDatabaseCount('places', 2);
    }

    public function test_source_payload_and_long_hours_round_trip_without_invented_values(): void
    {
        $profile = ['hours' => ['summary' => null, 'qualityFlags' => ['Chưa xác minh']], 'sources' => []];
        $credit = ['url' => 'https://example.invalid/photo', 'license' => 'Fixture', 'licenseUrl' => 'https://example.invalid/license'];
        $id = $this->insertPlace([
            'name' => 'Quán thử nghiệm – dữ liệu tự tạo', 'hours' => str_repeat('Giờ nguồn; ', 40),
            'products' => json_encode(['Bột chiên'], JSON_UNESCAPED_UNICODE), 'images' => '[]',
            'photo_source' => json_encode($credit), 'local_profile' => json_encode($profile),
            'source_metadata' => json_encode(['referenceOnly' => true, 'fieldVisitVerified' => false]),
            'source_updated_at' => '2026-11-08 02:33:19.045741',
        ]);
        $place = DB::table('places')->find($id);

        $this->assertSame('Quán thử nghiệm – dữ liệu tự tạo', $place->name);
        $this->assertSame(str_repeat('Giờ nguồn; ', 40), $place->hours);
        $this->assertSame(['Bột chiên'], json_decode($place->products, true));
        $this->assertSame([], json_decode($place->images, true));
        $this->assertEquals($credit, json_decode($place->photo_source, true));
        $this->assertEquals($profile, json_decode($place->local_profile, true));
        $this->assertSame('2026-11-08 02:33:19.045741', $place->source_updated_at);
    }

    public function test_reimport_updates_the_existing_source_row_and_preserves_both_ids(): void
    {
        $id = $this->insertPlace();
        DB::table('places')->updateOrInsert(['source' => 'osm', 'source_id' => 'node/123'], [
            'name' => 'Tên đã cập nhật', 'hours' => '24/7', 'lat' => 10.77, 'lng' => 106.7,
        ]);

        $this->assertDatabaseCount('places', 1);
        $this->assertDatabaseHas('places', ['id' => $id, 'public_id' => 'osm:node/123', 'name' => 'Tên đã cập nhật']);
    }

    #[DataProvider('invalidValues')]
    public function test_mysql_rejects_invalid_schema_values(array $values, int $errorCode): void
    {
        $this->assertRejected($values, $errorCode);
    }

    public static function invalidValues(): array
    {
        return [
            'missing public ID' => [['public_id' => null], 1048],
            'missing source' => [['source' => null], 1048],
            'missing source ID' => [['source_id' => null], 1048],
            'missing name' => [['name' => null], 1048],
            'missing city' => [['city' => null], 1048],
            'missing category' => [['category' => null], 1048],
            'invalid JSON' => [['products' => '{broken'], 3140],
            'latitude above maximum' => [['lat' => 90.0000001], 3819],
            'latitude below minimum' => [['lat' => -90.0000001], 3819],
            'longitude above maximum' => [['lng' => 180.0000001], 3819],
            'longitude below minimum' => [['lng' => -180.0000001], 3819],
            'negative price' => [['price' => -0.01], 3819],
        ];
    }

    public function test_places_migration_can_rollback_and_be_applied_again(): void
    {
        $migration = require database_path('migrations/2026_11_15_000000_create_places_table.php');
        $migration->down();
        $this->assertFalse(Schema::hasTable('places'));
        $this->assertTrue(Schema::hasTable('users'));

        $migration->up();
        $this->insertPlace();
        $this->assertDatabaseCount('places', 1);
    }

    private function assertRejected(array $values, int $errorCode, ?string $constraint = null): void
    {
        try {
            $this->insertPlace($values);
            $this->fail('MySQL accepted a row that violates the places schema.');
        } catch (QueryException $exception) {
            $this->assertSame($errorCode, $exception->errorInfo[1]);
            if ($constraint !== null) {
                $this->assertStringContainsString($constraint, $exception->getMessage());
            }
        }
    }

    private function insertPlace(array $values = []): int
    {
        return DB::table('places')->insertGetId(array_replace([
            'public_id' => 'osm:node/123', 'source' => 'osm', 'source_id' => 'node/123',
            'name' => 'Địa điểm kiểm thử tự tạo', 'city' => 'hcm', 'category' => 'food',
        ], $values));
    }
}
