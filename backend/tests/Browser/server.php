<?php

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\Rule;

$app = require __DIR__.'/bootstrap.php';

// This router is only loaded by the opt-in test server. Production routing never
// requires this file. Cookies, CSRF and all itinerary endpoints remain real Laravel.
Route::middleware('web')->post('/__itinerary_test/login', function (Request $request) {
    $data = $request->validate(['account' => ['required', Rule::in(['a', 'b'])]]);
    $user = User::query()->where('email', 'itinerary-browser-'.$data['account'].'@example.invalid')->firstOrFail();
    Auth::login($user);
    $request->session()->regenerate();

    return response()->json(['userId' => (string) $user->id]);
});

$app->handleRequest(Request::capture());
