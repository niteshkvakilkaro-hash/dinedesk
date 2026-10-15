<?php

namespace Tests\Feature\Ordering;

use App\Models\User;
use App\Modules\Delivery\Models\RiderDuty;
use App\Modules\Delivery\Models\RiderLocation;
use App\Modules\Notify\Support\SendWebPush;
use App\Modules\Ordering\Models\Order;
use Illuminate\Support\Facades\Queue;

/** Delivery riders: role, assigning orders, duty, location batches, the owner's map and the guest's view. */
class RiderTrackingTest extends OrderingTestCase
{
    private User $owner;

    private User $rider;

    protected function setUp(): void
    {
        parent::setUp();
        config(['dinedesk.webpush.public_key' => 'BPub', 'dinedesk.webpush.private_key' => 'priv']);
        $this->owner = $this->ownerOf($this->tenant);
        $this->rider = $this->staff($this->tenant, 'delivery', ['name' => 'Ravi Kumar Singh', 'phone' => '+919812345678']);
    }

    /** A cash-on-delivery order, moved on by the owner to $status. */
    private function deliveryOrder(string $status = 'ready'): Order
    {
        $res = $this->postJson('/api/v1/site/orders', $this->orderPayload([
            'type' => 'delivery',
            'payment_method' => 'cod',
            'address' => ['line1' => '12 MG Road', 'pincode' => '411038', 'lat' => 18.507, 'lng' => 73.807],
        ]), $this->site())->assertCreated();
        $order = $this->asTenant(fn () => Order::where('public_id', $res->json('data.order.id'))->firstOrFail());
        $this->actingAsUser($this->owner);
        foreach (['confirmed', 'preparing', 'ready', 'out_for_delivery'] as $step) {
            if ($order->fresh()->status === $status) {
                break;
            }
            $this->postJson("/api/v1/tenant/orders/{$order->id}/status", ['status' => $step])->assertOk();
        }

        return $order->fresh();
    }

    private function assign(Order $order, ?User $rider): void
    {
        $this->actingAsUser($this->owner)->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $rider?->id])->assertOk();
    }

    private function point(array $overrides = []): array
    {
        return $overrides + ['lat' => 18.5104, 'lng' => 73.8123, 'accuracy_m' => 12, 'speed' => 4.5, 'heading' => 90, 'battery' => 71, 'recorded_at' => now()->toIso8601String()];
    }

    private function onDuty(?User $rider = null): string
    {
        return $this->actingAsUser($rider ?? $this->rider)->postJson('/api/v1/tenant/rider/duty', ['on' => true])->assertOk()->json('data.sharing.token');
    }

    public function test_the_rider_role_only_runs_deliveries_and_an_owner_can_add_one(): void
    {
        $this->assertSame(['deliveries.run'], $this->rider->tenantPermissions());
        $this->actingAsUser($this->owner)->getJson('/api/v1/tenant/staff')->assertOk()->assertJsonFragment(['delivery']);
        $this->postJson('/api/v1/tenant/staff', ['name' => 'Arjun', 'phone' => '9876501234', 'role' => 'delivery'])->assertCreated()->assertJsonPath('data.role', 'delivery');

        // Everything else in the dashboard is closed to a rider.
        $order = $this->deliveryOrder();
        $this->actingAsUser($this->rider);
        foreach (['/api/v1/tenant/orders', '/api/v1/tenant/orders/'.$order->id, '/api/v1/tenant/riders', '/api/v1/tenant/staff', '/api/v1/tenant/ordering'] as $path) {
            $this->getJson($path)->assertForbidden();
        }
        $this->postJson("/api/v1/tenant/orders/{$order->id}/status", ['status' => 'out_for_delivery'])->assertForbidden();
        $this->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $this->rider->id])->assertForbidden();
        $this->getJson('/api/v1/tenant/rider')->assertOk();
    }

    public function test_an_order_is_given_to_a_rider_who_gets_an_alert_in_their_language_and_taken_back(): void
    {
        Queue::fake();
        $this->rider->update(['locale' => 'hi']);
        $order = $this->deliveryOrder();
        $this->actingAsUser($this->owner)->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $this->rider->id])
            ->assertOk()->assertJsonPath('data.rider.id', $this->rider->id)->assertJsonPath('data.rider.name', 'Ravi Kumar Singh');
        Queue::assertPushed(SendWebPush::class, fn ($job) => $job->userId === $this->rider->id
            && $job->payload['title'] === "डिलीवरी #{$order->number} आपको दी गई"
            && str_contains($job->payload['body'], 'कैश ₹'.$order->total) && $job->payload['url'] === '/rider/');
        $this->getJson('/api/v1/tenant/orders?type=delivery')->assertOk()->assertJsonPath('data.0.rider_name', 'Ravi Kumar Singh');
        $this->getJson("/api/v1/tenant/orders/{$order->id}")->assertJsonFragment(['status' => 'rider_assigned', 'note' => 'Ravi Kumar Singh']);

        // A cashier can take it back.
        $cashier = $this->staff($this->tenant, 'cashier');
        $this->actingAsUser($cashier)->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => null])->assertOk()->assertJsonPath('data.rider', null);
        $this->assertNull($order->fresh()->rider_id);
    }

    public function test_only_this_business_s_riders_and_only_delivery_orders(): void
    {
        $order = $this->deliveryOrder();
        $other = $this->business('Other Place');
        $foreign = $this->staff($other, 'delivery');
        $waiter = $this->staff($this->tenant, 'waiter');
        $this->actingAsUser($this->owner);
        $this->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $foreign->id])->assertStatus(422)->assertJsonPath('meta.code', 'not_a_rider');
        $this->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $waiter->id])->assertStatus(422)->assertJsonPath('meta.code', 'not_a_rider');
        $this->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => 999999])->assertStatus(422);
        $this->rider->update(['status' => 'disabled']);
        $this->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $this->rider->id])->assertStatus(422);

        $res = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $takeaway = $this->asTenant(fn () => Order::where('public_id', $res->json('data.order.id'))->firstOrFail());
        $this->rider->update(['status' => 'active']);
        $this->actingAsUser($this->owner)->postJson("/api/v1/tenant/orders/{$takeaway->id}/rider", ['rider_id' => $this->rider->id])->assertStatus(422)->assertJsonPath('meta.code', 'not_delivery');

        // Waiters and kitchen staff don't assign riders.
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/orders/{$order->id}/rider", ['rider_id' => $this->rider->id])->assertForbidden();
    }

    public function test_a_rider_sees_and_moves_only_their_own_orders(): void
    {
        $mine = $this->deliveryOrder();
        $theirs = $this->deliveryOrder();
        $cooking = $this->deliveryOrder('preparing');
        $other = $this->staff($this->tenant, 'delivery');
        $this->assign($mine, $this->rider);
        $this->assign($cooking, $this->rider);
        $this->assign($theirs, $other);

        $res = $this->actingAsUser($this->rider)->getJson('/api/v1/tenant/rider')->assertOk();
        $this->assertEqualsCanonicalizing([$mine->id, $cooking->id], array_column($res->json('data.orders'), 'id'));
        $row = collect($res->json('data.orders'))->firstWhere('id', $mine->id);
        $this->assertSame('Asha Verma', $row['customer_name']);
        $this->assertSame('+919829012345', $row['customer_phone']);
        $this->assertSame('12 MG Road', $row['address']['line1']);
        $this->assertSame($mine->total, $row['collect']);
        $this->assertSame('out_for_delivery', $row['next']);
        $this->assertSame(5, $row['items_count']);
        $this->assertNull(collect($res->json('data.orders'))->firstWhere('id', $cooking->id)['next']);

        $this->postJson("/api/v1/tenant/rider/orders/{$theirs->id}/status", ['status' => 'out_for_delivery'])->assertNotFound();
        $this->postJson("/api/v1/tenant/rider/orders/{$cooking->id}/status", ['status' => 'out_for_delivery'])->assertStatus(422)->assertJsonPath('meta.code', 'invalid_transition');
        $this->postJson("/api/v1/tenant/rider/orders/{$mine->id}/status", ['status' => 'cancelled'])->assertStatus(422);
        $this->postJson("/api/v1/tenant/rider/orders/{$mine->id}/status", ['status' => 'out_for_delivery'])->assertOk();
        $this->postJson("/api/v1/tenant/rider/orders/{$mine->id}/status", ['status' => 'completed'])->assertOk();
        $mine->refresh();
        $this->assertSame(['completed', 'paid'], [$mine->status, $mine->payment_status]);
        $this->getJson('/api/v1/tenant/rider')->assertJsonCount(1, 'data.orders');
    }

    public function test_duty_on_and_off_and_the_upload_token_only_sends_locations(): void
    {
        $this->actingAsUser($this->rider)->getJson('/api/v1/tenant/rider')->assertJsonPath('data.on_duty', false)->assertJsonPath('data.interval_sec', 300);
        $res = $this->postJson('/api/v1/tenant/rider/duty', ['on' => true])->assertOk()->assertJsonPath('data.on_duty', true)->assertJsonPath('data.sharing.interval_sec', 300);
        $token = $res->json('data.sharing.token');
        $this->assertNotEmpty($token);
        $this->assertSame(1, $this->asTenant(fn () => RiderDuty::whereNull('ended_at')->count()));
        // Twice on is still one duty.
        $this->postJson('/api/v1/tenant/rider/duty', ['on' => true])->assertOk();
        $this->assertSame(1, $this->asTenant(fn () => RiderDuty::count()));
        $token = $this->postJson('/api/v1/tenant/rider/duty', ['on' => true])->json('data.sharing.token');

        // The app's background service: Bearer upload token, the platform host.
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => "Bearer {$token}"];
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]], $headers)->assertOk()->assertJsonPath('data.accepted', 1)->assertJsonPath('data.on_duty', true);
        foreach (['/api/v1/tenant/rider', '/api/v1/auth/me', '/api/v1/tenant/orders'] as $path) {
            $this->app['auth']->forgetGuards();
            $this->getJson($path, $headers)->assertUnauthorized();
        }
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/tenant/rider/duty', ['on' => false], $headers)->assertUnauthorized();

        $this->actingAsUser($this->rider)->postJson('/api/v1/tenant/rider/duty', ['on' => false])->assertOk()->assertJsonPath('data.on_duty', false)->assertJsonPath('data.sharing', null);
        $this->getJson('/api/v1/tenant/rider')->assertJsonPath('data.on_duty', false)->assertJsonPath('data.last_sent_at', fn ($v) => $v !== null);
    }

    public function test_locations_are_kept_only_while_on_duty_and_checked(): void
    {
        $this->actingAsUser($this->rider)->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]])->assertStatus(409)->assertJsonPath('meta.code', 'not_on_duty');

        $this->travel(-10)->minutes();
        $this->onDuty();
        $this->travel(10)->minutes();
        $batch = [$this->point(['recorded_at' => now()->subMinutes(5)->toIso8601String()]), $this->point()];
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => $batch])->assertOk()->assertJsonPath('data.accepted', 2);
        // Sent again (the phone retried): stored once.
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => $batch])->assertOk()->assertJsonPath('data.accepted', 0);
        // Taken before the duty started: not kept.
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point(['recorded_at' => now()->subMinutes(30)->toIso8601String()])]])->assertOk()->assertJsonPath('data.accepted', 0);

        foreach ([
            ['lat' => 91],
            ['lng' => -181],
            ['battery' => 120],
            ['recorded_at' => now()->addMinutes(10)->toIso8601String()],
            ['recorded_at' => now()->subHours(25)->toIso8601String()],
        ] as $bad) {
            $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point($bad)]])->assertStatus(422);
        }
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => array_fill(0, 51, $this->point())])->assertStatus(422);
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => []])->assertStatus(422);

        // Off duty: what was taken during the duty still arrives (sent late), nothing after it.
        $this->postJson('/api/v1/tenant/rider/duty', ['on' => false])->assertOk();
        $this->travel(5)->minutes();
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point(['recorded_at' => now()->subMinutes(5)->subSeconds(30)->toIso8601String(), 'lat' => 18.6])]])->assertOk()->assertJsonPath('data.accepted', 1)->assertJsonPath('data.on_duty', false);
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]])->assertStatus(409);
        $this->assertSame(3, $this->asTenant(fn () => RiderLocation::count()));
    }

    public function test_location_uploads_are_throttled(): void
    {
        $this->onDuty();
        for ($i = 0; $i < 12; $i++) {
            $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point(['recorded_at' => now()->subSeconds($i)->toIso8601String()])]])->assertOk();
        }
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]])->assertStatus(429);
    }

    public function test_the_owner_sees_riders_latest_positions_orders_and_today_s_route(): void
    {
        $order = $this->deliveryOrder();
        $waiting = $this->deliveryOrder();
        $this->assign($order, $this->rider);
        $idle = $this->staff($this->tenant, 'delivery', ['name' => 'Zed']);
        $this->travel(-10)->minutes();
        $this->onDuty();
        $this->travel(10)->minutes();
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [
            $this->point(['lat' => 18.50, 'recorded_at' => now()->subMinutes(4)->toIso8601String()]),
            $this->point(['lat' => 18.51, 'battery' => 64]),
        ]])->assertOk();

        $res = $this->actingAsUser($this->owner)->getJson('/api/v1/tenant/riders')->assertOk()->assertJsonPath('meta.stale_minutes', 15);
        $ravi = collect($res->json('data.riders'))->firstWhere('id', $this->rider->id);
        $this->assertTrue($ravi['on_duty']);
        $this->assertEquals(18.51, $ravi['last']['lat']);
        $this->assertSame(64, $ravi['last']['battery']);
        $this->assertSame([$order->id], array_column($ravi['orders'], 'id'));
        $zed = collect($res->json('data.riders'))->firstWhere('id', $idle->id);
        $this->assertFalse($zed['on_duty']);
        $this->assertNull($zed['last']);
        $this->assertSame([$waiting->id], array_column($res->json('data.unassigned'), 'id'));

        $trail = $this->getJson("/api/v1/tenant/riders/{$this->rider->id}/trail")->assertOk()->json('data.points');
        $this->assertEquals([18.50, 18.51], array_column($trail, 'lat'));
        $this->getJson("/api/v1/tenant/riders/{$this->rider->id}/trail?date=2026-11-09")->assertJsonCount(0, 'data.points');

        // Kitchen staff see orders, not riders.
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/riders')->assertForbidden();
        // Another business's owner doesn't see them either.
        $other = $this->business('Other Place');
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/riders')->assertOk()->assertJsonCount(0, 'data.riders');
        $this->getJson("/api/v1/tenant/riders/{$this->rider->id}/trail")->assertStatus(422);
    }

    public function test_the_guest_sees_the_rider_only_while_out_for_delivery_and_recent(): void
    {
        $res = $this->postJson('/api/v1/site/orders', $this->orderPayload([
            'type' => 'delivery', 'payment_method' => 'cod', 'address' => ['line1' => '12 MG Road', 'pincode' => '411038'],
        ]), $this->site())->assertCreated();
        $url = '/api/v1/site/orders/'.$res->json('data.order.id').'?t='.$res->json('data.token');
        $order = $this->asTenant(fn () => Order::where('public_id', $res->json('data.order.id'))->firstOrFail());
        $this->actingAsUser($this->owner);
        foreach (['confirmed', 'preparing', 'ready'] as $s) {
            $this->postJson("/api/v1/tenant/orders/{$order->id}/status", ['status' => $s])->assertOk();
        }
        $this->assign($order, $this->rider);
        $this->onDuty();
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [
            $this->point(['lat' => 18.40, 'recorded_at' => now()->subMinutes(3)->toIso8601String()]),
            $this->point(['lat' => 18.5104321, 'lng' => 73.8123456]),
        ]])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson($url, $this->site())->assertOk()->assertJsonPath('data.rider', null); // still "ready"

        $this->actingAsUser($this->rider)->postJson("/api/v1/tenant/rider/orders/{$order->id}/status", ['status' => 'out_for_delivery'])->assertOk();
        $this->app['auth']->forgetGuards();
        $rider = $this->getJson($url, $this->site())->assertOk()->json('data.rider');
        $this->assertSame(['name_first', 'lat', 'lng', 'at'], array_keys($rider));
        $this->assertSame('Ravi', $rider['name_first']);
        $this->assertEquals([18.51043, 73.81235], [$rider['lat'], $rider['lng']]);
        $this->assertStringNotContainsString('9812345678', json_encode($this->getJson($url, $this->site())->json()));
        $this->getJson('/api/v1/site/orders/'.$res->json('data.order.id').'?t=wrong', $this->site())->assertNotFound();

        // No recent point: hidden.
        $this->travel(31)->minutes();
        $this->getJson($url, $this->site())->assertJsonPath('data.rider', null);
        $this->travel(-31)->minutes();

        // Delivered: hidden.
        $this->actingAsUser($this->rider)->postJson("/api/v1/tenant/rider/orders/{$order->id}/status", ['status' => 'completed'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson($url, $this->site())->assertJsonPath('data.rider', null);
    }

    public function test_old_points_are_purged_and_forgotten_duties_end(): void
    {
        $this->onDuty();
        $this->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]])->assertOk();
        $this->asTenant(fn () => RiderLocation::create(['user_id' => $this->rider->id, 'lat' => 18.5, 'lng' => 73.8, 'recorded_at' => now()->subDays(8)]));

        $this->artisan('riders:purge-locations')->assertSuccessful();
        $this->assertSame(1, $this->asTenant(fn () => RiderLocation::count()));

        // A duty left on for more than 14 hours ends by itself; no more points are taken.
        $this->travel(15)->hours();
        $this->artisan('riders:purge-locations')->assertSuccessful();
        $this->assertSame(0, $this->asTenant(fn () => RiderDuty::whereNull('ended_at')->count()));
        $this->actingAsUser($this->rider)->postJson('/api/v1/tenant/rider/locations', ['points' => [$this->point()]])->assertStatus(409);
        $this->getJson('/api/v1/tenant/rider')->assertJsonPath('data.on_duty', false);
    }
}
