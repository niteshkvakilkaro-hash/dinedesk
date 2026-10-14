<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class AuthTest extends TestCase
{
    private ?string $lastCode = null;

    protected function setUp(): void
    {
        parent::setUp();
        // The "log" OTP driver writes the code to the log; capture it.
        Event::listen(MessageLogged::class, function (MessageLogged $e) {
            if (preg_match('/\[OTP\].*: (\d{6})$/', $e->message, $m)) {
                $this->lastCode = $m[1];
            }
        });
    }

    public function test_email_sign_up_and_sign_in(): void
    {
        $this->postJson('/api/v1/auth/register', ['name' => 'Asha', 'email' => 'Asha@Example.test', 'password' => 'Password123'], ['X-Locale' => 'ta'])
            ->assertCreated()
            ->assertJsonPath('data.session.user.email', 'asha@example.test')
            ->assertJsonPath('data.session.user.locale', 'ta') // the language she signed up in
            ->assertJsonPath('data.session.next', 'onboarding');

        $this->postJson('/api/v1/auth/register', ['name' => 'Asha', 'email' => 'asha@example.test', 'password' => 'Password123'])
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->postJson('/api/v1/auth/login', ['email' => 'asha@example.test', 'password' => 'wrong'])->assertStatus(422);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'asha@example.test', 'password' => 'Password123'])->assertOk()->json('data.token');
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.user.name', 'Asha');
    }

    public function test_weak_passwords_are_rejected(): void
    {
        $this->postJson('/api/v1/auth/register', ['name' => 'Asha', 'email' => 'a@example.test', 'password' => 'short'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_mobile_otp_sign_up_needs_a_name_and_consumes_the_code_once(): void
    {
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '98290 12345'])->assertOk()->assertJsonPath('data.is_new', true)
            ->assertJsonMissingPath('data.dev_code'); // never echoed outside local
        $code = $this->lastCode;

        // New number without a name: asked for a name, code still valid.
        $this->postJson('/api/v1/auth/otp/verify', ['phone' => '+919829012345', 'code' => $code])
            ->assertStatus(422)->assertJsonPath('meta.code', 'name_required');

        $this->postJson('/api/v1/auth/otp/verify', ['phone' => '09829012345', 'code' => $code, 'name' => 'Ravi'])
            ->assertOk()->assertJsonPath('data.session.user.phone', '+919829012345')->assertJsonPath('data.session.user.locale', 'en');

        // Used once: the same code no longer works.
        $this->postJson('/api/v1/auth/otp/verify', ['phone' => '9829012345', 'code' => $code])->assertStatus(422);
        $this->assertSame(1, User::where('phone', '+919829012345')->count());
    }

    public function test_otp_wrong_attempts_lock_the_code_and_resend_is_throttled(): void
    {
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '9829012345'])->assertOk();
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '9829012345'])->assertStatus(429)->assertJsonPath('meta.code', 'otp_wait');
        $good = $this->lastCode;
        $bad = $good === '000000' ? '111111' : '000000';

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/otp/verify', ['phone' => '9829012345', 'code' => $bad, 'name' => 'Xavier'])->assertStatus(422);
        }
        // Even the right code is refused once locked.
        $this->postJson('/api/v1/auth/otp/verify', ['phone' => '9829012345', 'code' => $good, 'name' => 'Xavier'])->assertStatus(429)->assertJsonPath('meta.code', 'otp_locked');
    }

    public function test_invalid_phone_numbers_are_rejected(): void
    {
        $this->postJson('/api/v1/auth/otp/send', ['phone' => '12345'])->assertStatus(422)->assertJsonValidationErrors('phone');
    }

    public function test_disabled_users_cannot_sign_in(): void
    {
        $this->user(['email' => 'off@example.test', 'status' => 'disabled']);

        $this->postJson('/api/v1/auth/login', ['email' => 'off@example.test', 'password' => 'Password123'])
            ->assertForbidden()->assertJsonPath('meta.code', 'account_disabled');
    }
}
