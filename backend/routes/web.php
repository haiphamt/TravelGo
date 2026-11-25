<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\TripRoomController;
use App\Http\Middleware\AuthenticateRoom;
use Illuminate\Support\Facades\Route;

// The shared foundation currently authenticates using Laravel's web session guard.
// Keep these routes in the web group: sessions and CSRF must remain enabled.
Route::prefix('api/auth')->group(function () {
    Route::get('session', [AuthController::class, 'session']);
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1,auth-login');
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:5,1,auth-register');
    Route::post('logout', [AuthController::class, 'logout']);
    Route::post('profile', [AuthController::class, 'updateProfile'])->middleware(['auth:web', 'throttle:30,1,auth-profile']);
    Route::get('google', [GoogleAuthController::class, 'redirect'])->middleware('throttle:20,1,auth-google');
    Route::get('google/callback', [GoogleAuthController::class, 'callback']);
});

Route::prefix('api/rooms')->group(function () {
    Route::get('csrf', fn () => response()->noContent());

    Route::middleware([AuthenticateRoom::class, 'throttle:120,1'])->group(function () {
        Route::get('/', [TripRoomController::class, 'index']);
        Route::post('/', [TripRoomController::class, 'store']);
        Route::post('join', [TripRoomController::class, 'join']);

        Route::prefix('{code}')->where(['code' => '[A-F0-9]{8}'])->group(function () {
            Route::get('/', [TripRoomController::class, 'show']);
            Route::post('places', [TripRoomController::class, 'suggest']);
            Route::delete('places', [TripRoomController::class, 'removeSuggestion']);
            Route::post('voting', [TripRoomController::class, 'openVoting']);
            Route::put('votes', [TripRoomController::class, 'vote']);
            Route::post('decision', [TripRoomController::class, 'finalize']);
            Route::put('itinerary', [TripRoomController::class, 'itinerary']);
        });
    });
});
