<?php

use App\Http\Controllers\ItineraryController;
use App\Http\Controllers\ItinerarySuggestionController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Session + CSRF middleware. Auth is supplied by Task 1, never by a body userId.
Route::get('/api/itineraries/session', fn (Request $request) => response()->json([
    'authenticated' => $request->user() !== null,
    'userId' => $request->user() ? (string) $request->user()->id : null,
    'csrfToken' => csrf_token(),
]))->middleware('web');

Route::middleware(['web', 'auth'])->prefix('api/itineraries')->group(function () {
    Route::post('/suggestions', [ItinerarySuggestionController::class, 'store'])->middleware('throttle:20,1');
    Route::get('/', [ItineraryController::class, 'index']);
    Route::post('/', [ItineraryController::class, 'store']);
    Route::get('/{id}', [ItineraryController::class, 'show'])->whereUuid('id');
    Route::put('/{id}', [ItineraryController::class, 'update'])->whereUuid('id');
    Route::delete('/{id}', [ItineraryController::class, 'destroy'])->whereUuid('id');
});
