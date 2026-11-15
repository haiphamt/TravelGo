<?php

use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$db = DB::connection();
if (! app()->environment('testing') || $db->getDatabaseName() !== 'travelgo_test' || $db->getDriverName() !== 'mysql') {
    throw new RuntimeException('Only isolated test DB is allowed.');
}
foreach (['user', 'owner', 'admin'] as $actor) {
    $email = 'moderation-demo-'.$actor.'@example.invalid';
    $user = User::query()->where('email', $email)->first()
        ?? User::factory()->create(['name' => 'TravelGo Demo '.ucfirst($actor), 'email' => $email]);
    $user->forceFill(['role' => $actor === 'admin' ? 'admin' : 'user'])->save();
}
echo "Seeded three isolated browser-test accounts.\n";
