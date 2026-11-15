<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 2).'/vendor/autoload.php';

if (getenv('APP_ENV') !== 'testing' || getenv('TRAVELGO_E2E') !== '1') {
    throw new RuntimeException('The browser fixture server requires APP_ENV=testing and TRAVELGO_E2E=1.');
}

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$connection = DB::connection();
if (! $app->environment('testing') || $connection->getDriverName() !== 'mysql' || $connection->getDatabaseName() !== 'travelgo_test') {
    throw new RuntimeException('Browser tests may only use the dedicated MySQL travelgo_test schema.');
}
$actual = $connection->selectOne('SELECT DATABASE() AS db_name, VERSION() AS server_version', [], false);
if ($actual->db_name !== 'travelgo_test' || stripos($actual->server_version, 'MariaDB') !== false) {
    throw new RuntimeException('Unexpected database; refusing to start browser fixtures.');
}

return $app;
