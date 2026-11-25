<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        $connection = DB::connection();

        if (! app()->environment('testing') || $connection->getDriverName() !== 'mysql' ||
            $connection->getDatabaseName() !== 'travelgo_test' ||
            $connection->selectOne('SELECT DATABASE() AS db_name', [], false)->db_name !== 'travelgo_test') {
            throw new RuntimeException('Authentication tests require a dedicated MySQL travelgo_test database.');
        }
    }

    public function test_email_registration_and_sign_in_use_the_existing_web_session(): void
    {
        $this->getJson('/api/auth/session')->assertOk()->assertCookie('XSRF-TOKEN')->assertJsonPath('user', null);

        $this->postJson('/api/auth/register', [
            'name' => 'Du khách', 'email' => 'USER@EXAMPLE.COM', 'password' => 'valid-password',
            'password_confirmation' => 'valid-password', 'role' => 'admin',
        ])->assertCreated()->assertJsonPath('user.email', 'user@example.com')
            ->assertJsonPath('user.admin', false)->assertJsonMissingPath('user.password');

        $user = User::query()->sole();
        $this->assertTrue(Hash::check('valid-password', $user->password));
        $this->assertAuthenticatedAs($user, 'web');
        $this->getJson('/api/favorites')->assertOk();

        $this->postJson('/api/auth/logout')->assertNoContent();
        $this->assertGuest('web');
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('user', null);
        $this->getJson('/api/favorites')->assertUnauthorized();

        $this->postJson('/api/auth/login', ['email' => 'USER@example.com', 'password' => 'invalid-password'])
            ->assertUnprocessable()->assertJsonValidationErrors(['email']);
        $this->assertGuest('web');

        $this->postJson('/api/auth/login', ['email' => 'USER@example.com', 'password' => 'valid-password'])
            ->assertOk()->assertJsonPath('user.id', (string) $user->id);
        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_registration_validates_confirmation_bcrypt_limits_and_unique_email(): void
    {
        $user = User::factory()->create();
        $password = str_repeat('ế', 25);
        $this->postJson('/api/auth/register', [
            'name' => 'Du khách', 'email' => 'new@example.com', 'password' => $password, 'password_confirmation' => $password,
        ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
        $this->postJson('/api/auth/register', [
            'name' => 'Du khách', 'email' => strtoupper($user->email), 'password' => 'valid-password', 'password_confirmation' => 'mismatch',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_profile_update_validates_name_and_updates_only_the_current_account(): void
    {
        $this->postJson('/api/auth/profile')->assertUnauthorized();

        $user = User::factory()->create(['name' => 'Khách TravelGo']);
        $other = User::factory()->create();
        $this->actingAs($user, 'web');

        $this->postJson('/api/auth/profile', ['account_id' => (string) $user->id, 'name' => '  '])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/auth/profile', ['account_id' => (string) $user->id, 'name' => str_repeat('á', 101)])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/auth/profile', ['account_id' => (string) $other->id, 'name' => 'Tên sai tài khoản'])
            ->assertConflict();
        $this->assertSame('Khách TravelGo', $user->fresh()->name);
        $this->assertSame($other->name, $other->fresh()->name);

        $this->postJson('/api/auth/profile', [
            'account_id' => (string) $user->id,
            'name' => '  Người dùng TravelGo  ',
            'email' => 'updated@example.com',
            'role' => 'admin',
        ])->assertOk()->assertJsonPath('user.id', (string) $user->id)
            ->assertJsonPath('user.name', 'Người dùng TravelGo')->assertJsonPath('user.email', $user->email)
            ->assertJsonPath('user.admin', false);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Người dùng TravelGo', 'email' => $user->email]);
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('user.name', 'Người dùng TravelGo');
    }

    public function test_email_writes_require_csrf(): void
    {
        $this->app->bind(PreventRequestForgery::class, fn ($app) => new class($app, $app['encrypter']) extends PreventRequestForgery
        {
            protected function runningUnitTests()
            {
                return false;
            }
        });

        foreach (['register', 'login', 'logout', 'profile'] as $action) {
            $this->postJson('/api/auth/'.$action)->assertStatus(419);
        }
    }

    public function test_google_login_checks_state_pkce_and_preserves_identity_by_subject(): void
    {
        $this->configureGoogle();
        $this->getJson('/api/auth/session')->assertJsonPath('googleEnabled', true);
        [$authorization, $query] = $this->startGoogle('/kham-pha?category=coffee');
        $this->assertSame('accounts.google.com', parse_url($authorization, PHP_URL_HOST));
        $this->assertSame('S256', $query['code_challenge_method']);
        $this->assertNotEmpty($query['state']);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-provider-token']),
            'https://openidconnect.googleapis.com/v1/userinfo' => Http::sequence()
                ->push(['sub' => '12345', 'email' => 'google-user@example.com', 'email_verified' => true, 'name' => 'Du khách Google'])
                ->push(['sub' => '12345', 'email' => 'changed@example.com', 'email_verified' => true]),
        ]);

        $callback = fn (array $query) => $this->get('/api/auth/google/callback?'.http_build_query(['state' => $query['state'], 'code' => 'code']));
        $callback($query)->assertRedirect('/kham-pha?category=coffee');
        $user = User::query()->sole();
        $this->assertSame('12345', $user->getRawOriginal('google_sub'));
        $this->assertNotNull($user->email_verified_at);
        $this->assertAuthenticatedAs($user, 'web');

        Http::assertSent(fn (Request $request) => $request->url() === 'https://oauth2.googleapis.com/token' &&
            $query['code_challenge'] === rtrim(strtr(base64_encode(hash('sha256', $request['code_verifier'], true)), '+/', '-_'), '='));
        Http::assertSent(fn (Request $request) => $request->url() === 'https://openidconnect.googleapis.com/v1/userinfo' &&
            $request->hasHeader('Authorization', 'Bearer test-provider-token'));

        $this->postJson('/api/auth/logout')->assertNoContent();
        $callback($query)->assertRedirect('/?auth_error=google');
        $this->assertGuest('web');

        [, $query] = $this->startGoogle('/');
        $callback($query)->assertRedirect('/');
        $this->assertAuthenticatedAs($user, 'web');
        $this->assertDatabaseCount('users', 1);
    }

    public function test_google_rejects_mismatched_state_unverified_email_and_existing_email_collision(): void
    {
        $this->configureGoogle();
        $user = User::factory()->create(['email' => 'existing@example.com']);
        [, $query] = $this->startGoogle('/%5Cexample.com');
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'test-provider-token']),
            'https://openidconnect.googleapis.com/v1/userinfo' => Http::sequence()
                ->push(['sub' => '12345', 'email' => $user->email, 'email_verified' => true])
                ->push(['sub' => '67890', 'email' => 'unverified@example.com', 'email_verified' => false]),
        ]);

        $this->get('/api/auth/google/callback?state=incorrect&code=code')->assertRedirect('/?auth_error=google');
        Http::assertNothingSent();

        foreach (['/ban-do?category=food#map', '/ban-do'] as $returnTo) {
            [, $query] = $this->startGoogle($returnTo);
            $this->get('/api/auth/google/callback?state='.$query['state'].'&code=code')
                ->assertRedirect($returnTo === '/ban-do' ? '/ban-do?auth_error=google' : '/ban-do?category=food&auth_error=google#map');
            $this->assertGuest('web');
        }

        $this->assertDatabaseCount('users', 1);
        $this->assertNull($user->fresh()->getRawOriginal('google_sub'));
    }

    private function configureGoogle(): void
    {
        config(['services.google' => [
            'client_id' => 'test-client-id', 'client_secret' => 'test-client-secret',
            'redirect_uri' => 'http://127.0.0.1:4200/api/auth/google/callback',
        ]]);
        Http::preventStrayRequests();
    }

    private function startGoogle(string $returnTo): array
    {
        $response = $this->get('/api/auth/google?'.http_build_query(['return_to' => $returnTo]))->assertRedirect();
        $authorization = $response->headers->get('Location');
        parse_str((string) parse_url($authorization, PHP_URL_QUERY), $query);

        return [$authorization, $query];
    }
}
