<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Http\Request;

class AuthenticateRoom extends Authenticate
{
    // Preserve Laravel's guard checks, but API guests must never resolve an HTML login route.
    protected function redirectTo(Request $request): ?string
    {
        return null;
    }
}
