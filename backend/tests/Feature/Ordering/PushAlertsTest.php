<?php

namespace Tests\Feature\Ordering;

use App\Modules\Notify\Models\PushSubscription;
use App\Modules\Notify\Support\SendWebPush;
use Illuminate\Support\Facades\Queue;

/** Push alerts on staff phones: turned on per device; new orders reach everyone who sees orders. */
class PushAlertsTest extends OrderingTestCase
{
    private array $device = ['endpoint' => 'https://fcm.googleapis.com/fcm/send/abc123', 'keys' => ['p256dh' => 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'auth' => 'tBHItJI5svbpez7KI4CCXg']];

    protected function setUp(): void
    {
        parent::setUp();
        config(['dinedesk.webpush.public_key' => 'BPub', 'dinedesk.webpush.private_key' => 'priv']);
    }

    public function test_a_device_is_turned_on_and_off(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/push')->assertOk()->assertJsonPath('data.enabled', true)->assertJsonPath('data.public_key', 'BPub')->assertJsonPath('data.devices', 0);
        $this->postJson('/api/v1/tenant/push/subscribe', ['endpoint' => 'http://insecure.test/x'] + $this->device)->assertStatus(422);
        $this->postJson('/api/v1/tenant/push/subscribe', $this->device)->assertOk()->assertJsonPath('data.devices', 1);
        $this->postJson('/api/v1/tenant/push/subscribe', $this->device)->assertOk()->assertJsonPath('data.devices', 1); // same phone once

        // Someone else signs in on the same phone: it becomes theirs.
        $cashier = $this->staff($this->tenant, 'cashier');
        $this->actingAsUser($cashier)->postJson('/api/v1/tenant/push/subscribe', $this->device)->assertOk();
        $this->assertSame([$cashier->id], PushSubscription::withoutGlobalScopes()->pluck('user_id')->all());

        $this->postJson('/api/v1/tenant/push/unsubscribe', ['endpoint' => $this->device['endpoint']])->assertOk();
        $this->assertSame(0, PushSubscription::withoutGlobalScopes()->count());
    }

    public function test_new_orders_push_to_staff_who_see_orders(): void
    {
        Queue::fake();
        $owner = $this->ownerOf($this->tenant);
        $housekeeping = $this->staff($this->tenant, 'housekeeping'); // can't see orders
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();

        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $owner->id && str_starts_with($job->payload['title'], 'New order #') && $job->payload['url'] === '/dashboard/orders');
        Queue::assertNotPushed(SendWebPush::class, fn ($job) => $job->userId === $housekeeping->id);
    }

    public function test_each_staff_member_gets_the_alert_in_their_own_language(): void
    {
        Queue::fake();
        $owner = $this->ownerOf($this->tenant);
        $cashier = $this->staff($this->tenant, 'cashier', ['locale' => 'hi']);
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();

        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $cashier->id
            && preg_match('/^नया ऑर्डर #\S+ · ₹[\d.]+$/u', $job->payload['title']) && $job->payload['body'] === 'Asha Verma · टेकअवे');
        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $owner->id
            && str_starts_with($job->payload['title'], 'New order #') && $job->payload['body'] === 'Asha Verma · Takeaway');

        // The test alert too; an unsupported language falls back to English.
        $this->actingAsUser($cashier)->postJson('/api/v1/tenant/push/test')->assertOk();
        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $cashier->id && $job->payload['body'] === 'टेस्ट अलर्ट: इस डिवाइस पर पुश नोटिफ़िकेशन काम कर रहे हैं।');
        $owner->update(['locale' => 'xx']);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/push/test')->assertOk();
        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $owner->id && $job->payload['body'] === 'Test alert: push notifications work on this device.');
    }

    public function test_nothing_is_pushed_when_the_server_has_no_keys(): void
    {
        Queue::fake();
        config(['dinedesk.webpush.public_key' => null]);
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        Queue::assertNotPushed(SendWebPush::class);
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson('/api/v1/tenant/push/subscribe', $this->device)->assertStatus(422);
    }
}
