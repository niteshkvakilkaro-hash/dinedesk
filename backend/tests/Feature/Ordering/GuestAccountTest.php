<?php

namespace Tests\Feature\Ordering;

use App\Modules\Accounts\Models\GuestAccount;
use App\Modules\Ordering\Models\Customer;
use Illuminate\Support\Facades\Cache;

/** Guests sign in on the website with phone + SMS code to see their orders anywhere and keep addresses. */
class GuestAccountTest extends OrderingTestCase
{
    private function signIn(string $phone = '98290 12345'): array
    {
        config(['dinedesk.otp.dev_echo' => true]);
        $this->app['env'] = 'local';
        $code = $this->postJson('/api/v1/site/account/code', ['phone' => $phone], $this->site())->assertOk()->json('data.dev_code');
        $this->app['env'] = 'testing';

        return $this->postJson('/api/v1/site/account/verify', ['phone' => $phone, 'code' => $code], $this->site())->assertOk()->json('data');
    }

    private function as(string $token): array
    {
        return $this->site() + ['X-Guest-Token' => $token];
    }

    public function test_sign_in_shows_orders_from_any_device_without_touching_the_crm(): void
    {
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $customers = $this->asTenant(fn () => Customer::count());

        $data = $this->signIn();
        $this->assertSame('+919829012345', $data['account']['phone']);
        $this->assertSame('Asha Verma', $data['account']['name']); // from their order
        $this->assertCount(1, $data['account']['orders']);
        $order = $data['account']['orders'][0];
        // The link works: the guest proved the phone, so they may track it.
        $this->getJson("/api/v1/site/orders/{$order['id']}?t={$order['token']}", $this->site())->assertOk();
        $this->assertSame($customers, $this->asTenant(fn () => Customer::count()));

        // Someone else's phone sees nothing of Asha's.
        $other = $this->signIn('98111 22233');
        $this->assertSame([], $other['account']['orders']);
    }

    public function test_wrong_codes_are_limited_and_tokens_are_checked(): void
    {
        $this->postJson('/api/v1/site/account/code', ['phone' => '12345'], $this->site())->assertStatus(422);
        $this->postJson('/api/v1/site/account/code', ['phone' => '9829012345'], $this->site())->assertOk()->assertJsonMissingPath('data.dev_code');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/site/account/verify', ['phone' => '9829012345', 'code' => '000000'], $this->site())->assertStatus(422);
        }
        $this->postJson('/api/v1/site/account/verify', ['phone' => '9829012345', 'code' => '000000'], $this->site())->assertJsonPath('meta.code', 'otp_expired');

        $this->getJson('/api/v1/site/account', $this->as('nope'))->assertStatus(401);
        $this->getJson('/api/v1/site/account', $this->site())->assertStatus(401);
    }

    public function test_addresses_are_saved_and_sign_out_ends_the_session(): void
    {
        $token = $this->signIn()['token'];
        $this->putJson('/api/v1/site/account', ['name' => 'Asha', 'addresses' => [['label' => 'Home', 'line1' => '12 MG Road', 'pincode' => '411038'], ['line1' => 'x', 'pincode' => '411038']]], $this->as($token))->assertStatus(422);
        $this->putJson('/api/v1/site/account', ['name' => '<b>Asha</b>', 'addresses' => [['label' => 'Home', 'line1' => '12 MG Road', 'landmark' => 'Near park', 'pincode' => '411038']]], $this->as($token))->assertOk()
            ->assertJsonPath('data.name', 'Asha')->assertJsonPath('data.addresses.0.line1', '12 MG Road')->assertJsonPath('data.addresses.0.line2', null);
        $this->getJson('/api/v1/site/account', $this->as($token))->assertJsonPath('data.addresses.0.label', 'Home');

        $this->postJson('/api/v1/site/account/sign-out', [], $this->as($token))->assertOk();
        $this->getJson('/api/v1/site/account', $this->as($token))->assertStatus(401);
    }

    public function test_accounts_belong_to_one_business(): void
    {
        $token = $this->signIn()['token'];
        $other = $this->business('Cafe Sol', 'growth', ['status' => 'live']);
        $this->getJson('/api/v1/site/account', ['X-Tenant-Host' => $this->host($other), 'X-Guest-Token' => $token])->assertStatus(401);
        $this->assertSame(1, GuestAccount::withoutGlobalScopes()->count());
    }
}
