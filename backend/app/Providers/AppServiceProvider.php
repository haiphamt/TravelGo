<?php

namespace App\Providers;

use App\Contracts\ItinerarySuggestionProvider;
use App\Services\MockItinerarySuggestionProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(ItinerarySuggestionProvider::class, MockItinerarySuggestionProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
