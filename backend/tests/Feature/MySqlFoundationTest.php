<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class MySqlFoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();

        if (! app()->environment('testing') ||
            $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test') {
            throw new RuntimeException('Configure a dedicated MySQL travelgo_test database in .env.testing before running database tests.');
        }

        $server = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);

        if ($server->db_name !== 'travelgo_test' || stripos($server->server_version, 'MariaDB') !== false) {
            throw new RuntimeException('Database tests require the travelgo_test schema on MySQL.');
        }
    }

    public function test_mysql_uses_the_agreed_unsigned_account_id_type(): void
    {
        $columns = DB::table('information_schema.COLUMNS')
            ->where('TABLE_SCHEMA', DB::connection()->getDatabaseName())
            ->whereIn('TABLE_NAME', ['users', 'sessions'])
            ->whereIn('COLUMN_NAME', ['id', 'user_id'])
            ->get()
            ->keyBy(fn (object $column) => $column->TABLE_NAME.'.'.$column->COLUMN_NAME);

        $this->assertSame('bigint unsigned', $columns['users.id']->COLUMN_TYPE);
        $this->assertSame('PRI', $columns['users.id']->COLUMN_KEY);
        $this->assertSame('auto_increment', $columns['users.id']->EXTRA);
        $this->assertSame('bigint unsigned', $columns['sessions.user_id']->COLUMN_TYPE);
    }

    public function test_seeding_twice_preserves_demo_accounts_and_their_ids(): void
    {
        $this->seed(DatabaseSeeder::class);

        $accounts = User::query()->orderBy('id')->pluck('id', 'email')->all();

        $this->assertSame([
            'travelgo-demo-1@example.invalid',
            'travelgo-demo-2@example.invalid',
        ], array_keys($accounts));
        $this->assertDatabaseHas('users', [
            'email' => 'travelgo-demo-1@example.invalid',
            'name' => 'TravelGo Demo – Minh họa 1',
        ]);

        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('users', 2);
        $this->assertSame($accounts, User::query()->orderBy('id')->pluck('id', 'email')->all());
    }
}
