<?php

use App\Http\Controllers\FavoriteController;
use App\Http\Controllers\PlaceController;
use App\Http\Controllers\ReviewController;
use Illuminate\Support\Facades\Route;

Route::get('places', [PlaceController::class, 'index']);
Route::get('places/catalog', [PlaceController::class, 'catalog']);
Route::get('places/detail', [PlaceController::class, 'show']);

// Session and CSRF use Laravel's web guard, shared with Task 1 authentication.
Route::middleware('web')->group(function () {
    Route::get('reviews', [ReviewController::class, 'index']);
    Route::get('review-photos/{photo}', [ReviewController::class, 'photo'])->whereNumber('photo');
    Route::middleware('auth')->group(function () {
        Route::get('favorites', [FavoriteController::class, 'index']);
        Route::put('favorites', [FavoriteController::class, 'store']);
        Route::delete('favorites', [FavoriteController::class, 'destroy']);
        Route::get('reviews/mine', [ReviewController::class, 'mine']);
        Route::post('reviews', [ReviewController::class, 'store']);
        Route::put('reviews/{review}', [ReviewController::class, 'update'])->whereNumber('review');
        Route::delete('reviews/{review}', [ReviewController::class, 'destroy'])->whereNumber('review');
    });
});
