<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GoogleAuthController extends Controller
{
    public static function enabled(): bool
    {
        return filled(config('services.google.client_id'))
            && filled(config('services.google.client_secret'))
            && filled(config('services.google.redirect_uri'));
    }

    public function redirect(Request $request): RedirectResponse
    {
        $returnTo = $this->returnPath($request->query('return_to'));
        if (! self::enabled()) {
            return $this->failed($returnTo);
        }
        if ($request->user('web')) {
            return $this->returnTo($returnTo);
        }

        $state = Str::random(64);
        $verifier = Str::random(64);
        $request->session()->put('google_oauth', [
            'state' => $state, 'verifier' => $verifier, 'return_to' => $returnTo, 'expires' => now()->addMinutes(10)->timestamp,
        ]);

        $query = http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect_uri'),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986);

        return $this->returnTo('https://accounts.google.com/o/oauth2/v2/auth?'.$query);
    }

    public function callback(Request $request): RedirectResponse
    {
        $oauth = $request->session()->pull('google_oauth');
        $returnTo = $oauth['return_to'] ?? '/';
        $state = $request->query('state');
        $code = $request->query('code');
        if (! self::enabled() || ! $oauth || $oauth['expires'] <= now()->timestamp
            || ! is_string($state) || ! hash_equals($oauth['state'], $state)
            || ! is_string($code) || $code === '' || $request->query('error') !== null) {
            return $this->failed($returnTo);
        }
        if ($request->user('web')) {
            return $this->returnTo($returnTo);
        }

        $profile = $this->profile($code, $oauth['verifier']);
        $subject = $profile['sub'] ?? null;
        $email = $profile['email'] ?? null;
        if (! is_string($subject) || ! preg_match('/\A[!-~]{1,255}\z/', $subject)
            || ! is_string($email) || strlen($email) > 254 || ! filter_var($email, FILTER_VALIDATE_EMAIL)
            || ($profile['email_verified'] ?? false) !== true) {
            return $this->failed($returnTo);
        }

        $user = $this->resolveUser($subject, Str::lower($email), $profile['name'] ?? null);
        if (! $user) {
            return $this->failed($returnTo);
        }

        Auth::guard('web')->login($user);

        return $this->returnTo($returnTo);
    }

    private function profile(string $code, string $verifier): ?array
    {
        $http = Http::acceptJson()->connectTimeout(5)->timeout(10)->withoutRedirecting()
            ->withOptions(['verify' => config('services.google.ca_bundle') ?: true]);

        try {
            $token = $http->asForm()->post('https://oauth2.googleapis.com/token', [
                'client_id' => config('services.google.client_id'),
                'client_secret' => config('services.google.client_secret'),
                'redirect_uri' => config('services.google.redirect_uri'),
                'grant_type' => 'authorization_code',
                'code' => $code,
                'code_verifier' => $verifier,
            ]);
            $accessToken = $token->json('access_token');
            if (! $token->successful() || ! is_string($accessToken) || $accessToken === '') {
                return null;
            }

            $response = $http->withToken($accessToken)->get('https://openidconnect.googleapis.com/v1/userinfo');
            $profile = $response->json();

            return $response->successful() && is_array($profile) ? $profile : null;
        } catch (ConnectionException) {
            return null;
        }
    }

    private function resolveUser(string $subject, string $email, mixed $name): ?User
    {
        $user = User::query()->where('google_sub', $subject)->first();
        if ($user) {
            return $user;
        }

        // Linking an existing email account requires proof of ownership of that account.
        try {
            $user = new User([
                'name' => is_string($name) && trim($name) !== '' ? Str::substr(trim($name), 0, 100) : 'Người dùng TravelGo',
                'email' => $email,
                'password' => Str::random(64),
            ]);
            $user->forceFill(['google_sub' => $subject, 'email_verified_at' => now()])->save();

            return $user;
        } catch (UniqueConstraintViolationException) {
            return User::query()->where('google_sub', $subject)->first();
        }
    }

    private function returnPath(mixed $path): string
    {
        if (! is_string($path) || strlen($path) > 2048 || ! str_starts_with($path, '/')) {
            return '/';
        }
        $decoded = rawurldecode($path);

        return str_starts_with($decoded, '//') || str_contains($decoded, '\\') || preg_match('/[\x00-\x1f\x7f]/', $decoded)
            ? '/' : $path;
    }

    private function failed(string $returnTo): RedirectResponse
    {
        [$path, $fragment] = array_pad(explode('#', $returnTo, 2), 2, null);
        $path .= (str_contains($path, '?') ? '&' : '?').'auth_error=google';

        return $this->returnTo($path.($fragment === null ? '' : '#'.$fragment));
    }

    private function returnTo(string $url): RedirectResponse
    {
        return new RedirectResponse($url, 302, ['Cache-Control' => 'no-store, private', 'Referrer-Policy' => 'no-referrer']);
    }
}
