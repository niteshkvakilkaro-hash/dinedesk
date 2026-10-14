<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** My account: name, email, mobile (verified by SMS code), password and language, for owners and staff alike. */
class AccountTest extends TestCase
{
    private ?string $lastCode = null;

    protected function setUp(): void
    {
        parent::setUp();
        Event::listen(MessageLogged::class, function (MessageLogged $e) {
            if (preg_match('/\[OTP\].*: (\d{6})$/', $e->message, $m)) {
                $this->lastCode = $m[1];
            }
        });
    }

    public function test_sign_in_is_required(): void
    {
        $this->patchJson('/api/v1/account', ['name' => 'X'])->assertUnauthorized();
        $this->putJson('/api/v1/account/password', ['password' => 'Password999', 'password_confirmation' => 'Password999'])->assertUnauthorized();
        $this->postJson('/api/v1/account/phone/code', ['phone' => '9829012345'])->assertUnauthorized();
        $this->postJson('/api/v1/account/phone/verify', ['phone' => '9829012345', 'code' => '123456'])->assertUnauthorized();
    }

    public function test_staff_update_their_own_name_and_language_only(): void
    {
        $tenant = $this->business();
        $waiter = $this->staff($tenant, 'waiter', ['name' => 'Ravi']);
        $owner = $this->ownerOf($tenant);

        $this->actingAsUser($waiter)->patchJson('/api/v1/account', ['name' => ' <b>Ravi Kumar</b> ', 'locale' => 'hi'])->assertOk()
            ->assertJsonPath('data.user.name', 'Ravi Kumar')->assertJsonPath('data.user.locale', 'hi')->assertJsonPath('data.role', 'waiter');
        $this->assertSame(['Ravi Kumar', 'hi'], [$waiter->fresh()->name, $waiter->fresh()->locale]);
        $this->assertSame('en', $owner->fresh()->locale);

        $this->patchJson('/api/v1/account', ['locale' => 'fr'])->assertStatus(422)->assertJsonValidationErrors('locale');
        $this->patchJson('/api/v1/account', ['name' => 'R'])->assertStatus(422)->assertJsonValidationErrors('name');
    }

    public function test_changing_email_needs_the_current_password(): void
    {
        $user = $this->user(['email' => 'asha@example.test']);
        $this->user(['email' => 'taken@example.test']);

        $this->actingAsUser($user)->patchJson('/api/v1/account', ['email' => 'new@example.test'])->assertStatus(422)->assertJsonPath('meta.code', 'wrong_password');
        $this->patchJson('/api/v1/account', ['email' => 'new@example.test', 'current_password' => 'nope'])->assertStatus(422)->assertJsonPath('meta.code', 'wrong_password');
        $this->patchJson('/api/v1/account', ['email' => 'taken@example.test', 'current_password' => 'Password123'])->assertStatus(422)->assertJsonValidationErrors('email');
        // Can't remove the only way to sign in.
        $this->patchJson('/api/v1/account', ['email' => null, 'current_password' => 'Password123'])->assertStatus(422)->assertJsonPath('meta.code', 'email_required');

        $this->patchJson('/api/v1/account', ['email' => 'New@Example.test', 'current_password' => 'Password123'])->assertOk()->assertJsonPath('data.user.email', 'new@example.test');
        // The same email again is not a change: no password needed.
        $this->patchJson('/api/v1/account', ['email' => 'new@example.test', 'name' => 'Asha'])->assertOk();
    }

    public function test_change_password_wrong_current_is_refused_and_other_devices_are_signed_out(): void
    {
        $user = $this->user();
        $user->createToken('other-phone');

        $this->actingAsUser($user)->putJson('/api/v1/account/password', ['current_password' => 'wrong', 'password' => 'NewPass123', 'password_confirmation' => 'NewPass123'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'wrong_password');
        $this->putJson('/api/v1/account/password', ['current_password' => 'Password123', 'password' => 'short', 'password_confirmation' => 'short'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->putJson('/api/v1/account/password', ['current_password' => 'Password123', 'password' => 'NewPass123', 'password_confirmation' => 'Different123'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertSame(1, $user->tokens()->count());

        $this->putJson('/api/v1/account/password', ['current_password' => 'Password123', 'password' => 'NewPass123', 'password_confirmation' => 'NewPass123'])->assertOk();
        $this->assertTrue(Hash::check('NewPass123', $user->fresh()->password));
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_a_mobile_sign_up_sets_a_password_without_a_current_one(): void
    {
        $user = User::create(['name' => 'Meena', 'phone' => '+919829011111', 'phone_verified_at' => now()]);
        $this->actingAsUser($user)->getJson('/api/v1/auth/me')->assertJsonPath('data.user.has_password', false);

        $this->putJson('/api/v1/account/password', ['password' => 'Password123', 'password_confirmation' => 'Password123'])->assertOk()
            ->assertJsonPath('data.user.has_password', true);
        // From now on the current password is needed.
        $this->putJson('/api/v1/account/password', ['password' => 'Password456', 'password_confirmation' => 'Password456'])->assertStatus(422)->assertJsonPath('meta.code', 'wrong_password');
    }

    public function test_mobile_number_is_verified_by_sms_code(): void
    {
        $tenant = $this->business();
        $owner = $this->ownerOf($tenant);
        $this->assertNull($owner->phone);

        $this->actingAsUser($owner)->postJson('/api/v1/account/phone/code', ['phone' => '12345'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->postJson('/api/v1/account/phone/code', ['phone' => '98290 12345'])->assertOk()->assertJsonMissingPath('data.dev_code');
        $good = $this->lastCode;
        $bad = $good === '000000' ? '111111' : '000000';

        $this->postJson('/api/v1/account/phone/verify', ['phone' => '9829012345', 'code' => $bad])->assertStatus(422)->assertJsonPath('meta.code', 'otp_invalid');
        $this->assertNull($owner->fresh()->phone);
        // A code only works for the number it was sent to.
        $this->postJson('/api/v1/account/phone/verify', ['phone' => '9829099999', 'code' => $good])->assertStatus(422);

        $this->postJson('/api/v1/account/phone/verify', ['phone' => '+919829012345', 'code' => $good])->assertOk()
            ->assertJsonPath('data.user.phone', '+919829012345')->assertJsonPath('data.user.phone_verified', true);
        $this->assertNotNull($owner->fresh()->phone_verified_at);
        // Used once.
        $this->postJson('/api/v1/account/phone/verify', ['phone' => '+919829012345', 'code' => $good])->assertStatus(422);
        $this->postJson('/api/v1/account/phone/code', ['phone' => '9829012345'])->assertStatus(422)->assertJsonPath('meta.code', 'phone_unchanged');
    }

    public function test_a_number_used_by_another_account_is_refused(): void
    {
        $this->user(['phone' => '+919829012345']);
        $me = $this->user();

        $this->actingAsUser($me)->postJson('/api/v1/account/phone/code', ['phone' => '9829012345'])->assertStatus(422)->assertJsonPath('meta.code', 'phone_taken');

        // Taken between the code and the verification.
        $this->postJson('/api/v1/account/phone/code', ['phone' => '9829077777'])->assertOk();
        $this->user(['phone' => '+919829077777']);
        $this->postJson('/api/v1/account/phone/verify', ['phone' => '9829077777', 'code' => $this->lastCode])->assertStatus(422)->assertJsonPath('meta.code', 'phone_taken');
        $this->assertNull($me->fresh()->phone);
    }
}
