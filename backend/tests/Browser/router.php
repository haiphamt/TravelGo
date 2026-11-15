<?php

use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

$root = dirname(__DIR__, 3);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (! str_starts_with($path, '/api/') && ! str_starts_with($path, '/__moderation_test/')) {
    $asset = realpath($root.'/frontend/dist/travelgo/browser'.$path);
    $public = realpath($root.'/frontend/dist/travelgo/browser');
    if ($asset && str_starts_with($asset, $public.DIRECTORY_SEPARATOR) && is_file($asset)) {
        return false;
    }
    header('Content-Type: text/html; charset=utf-8');
    readfile($root.'/frontend/dist/travelgo/browser/index.html');

    return;
}
require $root.'/backend/vendor/autoload.php';
$app = require $root.'/backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
Route::middleware('web')->get('/__moderation_test/login/{actor}', function (string $actor) {
    abort_unless(app()->environment('testing') && request()->ip() === '127.0.0.1' && in_array($actor, ['user', 'owner', 'admin'], true), 404);
    $user = User::query()->where('email', 'moderation-demo-'.$actor.'@example.invalid')->firstOrFail();
    Auth::login($user);
    request()->session()->regenerate();

    return redirect('/dong-gop');
});
$app->handleRequest(Request::capture());
