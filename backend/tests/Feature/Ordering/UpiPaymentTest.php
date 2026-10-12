<?php

namespace Tests\Feature\Ordering;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Services\OrderingSettings;

/** Paying the restaurant's own UPI ID: offered once set up, reference from the guest, confirmed by staff. */
class UpiPaymentTest extends OrderingTestCase
{
    private function enableUpi(?string $vpa = 'spiceroute@okicici'): void
    {
        $this->asTenant(function () use ($vpa) {
            $s = app(OrderingSettings::class)->get();
            $s['payments']['upi'] = true;
            $s['upi'] = ['vpa' => $vpa, 'payee' => null];
            app(OrderingSettings::class)->save($s);
        });
    }

    private function place(): array
    {
        $payload = $this->orderPayload(['payment_method' => 'upi']);

        return $this->postJson('/api/v1/site/orders', $payload, $this->site())->assertCreated()->json('data');
    }

    public function test_upi_is_offered_only_when_switched_on_with_an_upi_id(): void
    {
        $this->getJson('/api/v1/site', $this->site())->assertJsonPath('data.ordering.upi', null);
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['payment_method' => 'upi']), $this->site())->assertStatus(422);

        $this->enableUpi();
        $this->getJson('/api/v1/site', $this->site())
            ->assertJsonPath('data.ordering.upi', ['vpa' => 'spiceroute@okicici', 'payee' => 'Spice Route'])
            ->assertJsonPath('data.ordering.payment_methods.takeaway', ['counter', 'upi'])
            ->assertJsonPath('data.ordering.payment_methods.delivery', ['cod', 'upi']);
    }

    public function test_the_owner_must_give_a_valid_upi_id(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $settings = $this->actingAsUser($owner)->getJson('/api/v1/tenant/ordering')->json('data.settings');
        $settings['payments']['upi'] = true;
        $settings['upi'] = ['vpa' => 'not an id', 'payee' => null];
        $this->putJson('/api/v1/tenant/ordering', $settings)->assertStatus(422)->assertJsonValidationErrors('upi.vpa');
        $settings['upi'] = ['vpa' => ' SpiceRoute@OKAXIS ', 'payee' => '<b>Spice</b> Route'];
        $this->putJson('/api/v1/tenant/ordering', $settings)->assertOk();
        $this->assertSame(['vpa' => 'spiceroute@okaxis', 'payee' => 'Spice Route'], $this->asTenant(fn () => app(OrderingSettings::class)->get()['upi']));
    }

    public function test_guest_reference_then_staff_confirmation(): void
    {
        $this->enableUpi();
        $data = $this->place();
        $id = $data['order']['id'];
        $token = $data['token'];
        $this->assertSame('unpaid', $data['order']['payment_status']);

        $this->postJson("/api/v1/site/orders/{$id}/upi-reference", ['t' => 'wrong', 'reference' => '412345678901'], $this->site())->assertNotFound();
        $this->postJson("/api/v1/site/orders/{$id}/upi-reference", ['t' => $token, 'reference' => '12 34'], $this->site())->assertStatus(422);
        $this->postJson("/api/v1/site/orders/{$id}/upi-reference", ['t' => $token, 'reference' => '412345678901'], $this->site())->assertOk()
            ->assertJsonPath('data.payment_status', 'pending')->assertJsonPath('data.payment_reference', '412345678901');

        $owner = $this->ownerOf($this->tenant);
        $internal = $this->asTenant(fn () => \App\Modules\Ordering\Models\Order::where('public_id', $id)->value('id'));
        $this->actingAsUser($owner)->getJson("/api/v1/tenant/orders/{$internal}")->assertJsonPath('data.payment_reference', '412345678901');
        $this->postJson("/api/v1/tenant/orders/{$internal}/upi-received")->assertOk()->assertJsonPath('data.payment_status', 'paid');
        $this->postJson("/api/v1/tenant/orders/{$internal}/upi-received")->assertStatus(422);
        $this->assertTrue($this->asTenant(fn () => AuditLog::query()->where('action', 'order.upi_received')->exists()));

        // Once paid, the guest can't change the reference.
        $this->postJson("/api/v1/site/orders/{$id}/upi-reference", ['t' => $token, 'reference' => '999999999999'], $this->site())->assertStatus(422);
    }

    public function test_completing_an_upi_order_settles_it_and_waiters_cannot_confirm(): void
    {
        $this->enableUpi();
        $internal = $this->asTenant(fn () => \App\Modules\Ordering\Models\Order::where('public_id', $this->place()['order']['id'])->value('id'));

        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->postJson("/api/v1/tenant/orders/{$internal}/upi-received")->assertForbidden();
        $owner = $this->ownerOf($this->tenant);
        foreach (['confirmed', 'preparing', 'ready', 'completed'] as $s) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$internal}/status", ['status' => $s])->assertOk();
        }
        $this->getJson("/api/v1/tenant/orders/{$internal}")->assertJsonPath('data.payment_status', 'paid');
    }
}
