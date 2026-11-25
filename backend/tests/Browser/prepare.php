<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

require __DIR__.'/bootstrap.php';

// bootstrap.php verifies the actual database before any reset can run.
Artisan::call('migrate:fresh', ['--force' => true]);
$fixture = json_decode(file_get_contents(dirname(__DIR__, 3).'/frontend/tests/e2e/fixtures/catalog.json'), true, flags: JSON_THROW_ON_ERROR);
foreach ($fixture['places'] as $place) {
    DB::table('places')->insert([
        'public_id' => $place['id'], 'source' => 'demo', 'source_id' => $place['id'],
        'name' => $place['name'], 'city' => $place['city'], 'category' => $place['category'],
        'local' => $place['local'], 'area' => $place['area'], 'price' => $place['price'],
        'hours' => $place['hours'], 'lat' => $place['lat'], 'lng' => $place['lng'],
        'products' => json_encode($place['products'], JSON_THROW_ON_ERROR),
    ]);
}
foreach (['a', 'b'] as $account) {
    User::factory()->create(['name' => 'TravelGo Browser Demo '.$account, 'email' => 'itinerary-browser-'.$account.'@example.invalid']);
}
User::factory()->create([
    'name' => 'TravelGo Browser Admin',
    'email' => 'moderation-browser@example.invalid',
    'role' => 'admin',
]);
echo "Prepared travelgo_test with three fixture users and four demo places.\n";
