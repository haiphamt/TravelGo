<?php

// Separate PHP process used only by the MySQL concurrency tests; never an HTTP route.
use App\Models\User;
use App\Services\RoomItineraryCopyService;
use App\Services\Rooms\RoomService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$root = dirname(__DIR__, 2);
require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->loadEnvironmentFrom('.env.testing');
$app->make(Kernel::class)->bootstrap();
$connection = DB::connection();
$server = $connection->selectOne('SELECT DATABASE() AS db, VERSION() AS version');
if (! $app->environment('testing') || $connection->getDriverName() !== 'mysql' ||
    $server->db !== 'travelgo_test' || stripos($server->version, 'MariaDB') !== false) {
    fwrite(STDERR, 'Worker requires the dedicated MySQL test database.');
    exit(1);
}
$user = User::query()->findOrFail($argv[3]);
echo "ready\n";
flush();
try {
    $rooms = $app->make(RoomService::class);
    $ids = json_decode($argv[4], true, flags: JSON_THROW_ON_ERROR);
    $result = match ($argv[1]) {
        'join' => $rooms->join($argv[2], $user, []),
        'suggest' => $rooms->suggest($argv[2], $user, $ids[0]),
        'vote' => $rooms->vote($argv[2], $user, $ids),
        'finalize' => $rooms->finalize($argv[2], $user, $ids),
        'copy' => ['revision' => $app->make(RoomItineraryCopyService::class)->copy($user->id, $argv[2], $ids[0])->version],
    };
    echo json_encode(['status' => 200, 'revision' => $result['revision']], JSON_THROW_ON_ERROR);
} catch (ValidationException) {
    echo json_encode(['status' => 422]);
} catch (HttpExceptionInterface $error) {
    echo json_encode(['status' => $error->getStatusCode()]);
}
