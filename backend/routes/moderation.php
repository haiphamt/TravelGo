<?php

use App\Http\Controllers\ModerationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:web', 'throttle:120,1'])->group(function () {
    Route::get('moderation/session', [ModerationController::class, 'session']);
    Route::get('moderation/place', [ModerationController::class, 'place']);
    Route::get('moderation/reviews', [ModerationController::class, 'reviews']);
    Route::get('moderation/queue', [ModerationController::class, 'queue']);
    Route::post('moderation/{contribution}/decision', [ModerationController::class, 'decide']);
    Route::get('contributions', [ModerationController::class, 'index']);
    Route::post('contributions', [ModerationController::class, 'store']);
    Route::get('contributions/{contribution}', [ModerationController::class, 'show']);
    Route::put('contributions/{contribution}', [ModerationController::class, 'resubmit']);
    Route::post('contributions/{contribution}/withdraw', [ModerationController::class, 'withdraw']);
    Route::get('owner/grants', [ModerationController::class, 'grants']);
    Route::put('owner/reviews/{reviewId}/reply', [ModerationController::class, 'reply'])->whereNumber('reviewId');
});
