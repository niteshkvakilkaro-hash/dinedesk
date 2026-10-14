<?php

namespace Tests\Feature\Ordering;

use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Notifications\NewOrderForStaff;
use App\Modules\Ordering\Notifications\OrderMessage;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Settings\Services\TenantSettings;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

class OrderLifecycleTest extends OrderingTestCase
{
    public function test_customer_places_an_order_and_tracks_it_through_every_status(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);
        $waiter = $this->staff($this->tenant, 'waiter');
        $kitchen = $this->staff($this->tenant, 'kitchen');

        $res = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())
            ->assertCreated()
            ->assertJsonPath('data.order.number', 1001)
            ->assertJsonPath('data.order.status', 'pending')
            ->assertJsonPath('data.order.payment_status', 'unpaid')
            ->assertJsonPath('data.order.items.0.variant_name', 'Full')
            ->assertJsonPath('data.order.items.0.addons.0.name', 'Extra butter')
            // Dal (260+20)×2 = 560 + naan 3×60 = 180 → 740 + 5% GST 37 + packaging 10
            ->assertJsonPath('data.order.total', '787.00')
            ->assertJsonPath('data.razorpay', null);
        $id = $res->json('data.order.id');
        $token = $res->json('data.token');

        // Staff with orders.view get an in-app alert; the customer an email (prefs default to email).
        Notification::assertSentTo([$owner, $waiter, $kitchen], NewOrderForStaff::class);
        Notification::assertSentTo(new AnonymousNotifiable, OrderMessage::class, fn ($n, $channels, $notifiable) => $n->kind === 'placed' && $notifiable->routes['mail'] === 'asha@example.com' && str_contains($n->toText(), '#1001'));

        // Tracking needs the private token.
        $this->getJson("/api/v1/site/orders/{$id}", $this->site())->assertNotFound();
        $this->getJson("/api/v1/site/orders/{$id}?t=wrong", $this->site())->assertNotFound();
        $this->getJson("/api/v1/site/orders/{$id}?t={$token}", $this->site())->assertOk()->assertJsonPath('data.status', 'pending')->assertJsonMissingPath('data.customer_phone');

        $order = Order::withoutTenancy()->where('public_id', $id)->firstOrFail();
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/orders/{$order->id}/status", ['status' => 'confirmed'])->assertForbidden();

        $this->actingAsUser($owner);
        $move = fn (string $to, ?string $note = null) => $this->postJson("/api/v1/tenant/orders/{$order->id}/status", ['status' => $to, 'note' => $note]);
        $move('ready')->assertStatus(422)->assertJsonPath('meta.code', 'invalid_transition');
        $move('confirmed')->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.next', ['preparing', 'cancelled']);
        $move('preparing')->assertOk();
        $move('ready')->assertOk()->assertJsonPath('data.next', ['completed', 'cancelled']); // takeaway: no "out for delivery"
        $move('out_for_delivery')->assertStatus(422);
        $move('completed')->assertOk()->assertJsonPath('data.payment_status', 'paid'); // paid at the counter

        $this->getJson("/api/v1/site/orders/{$id}?t={$token}", $this->site())
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonCount(5, 'data.timeline');
        Notification::assertSentTo(new AnonymousNotifiable, OrderMessage::class, fn ($n) => $n->kind === 'ready_takeaway');
        Notification::assertSentTo(new AnonymousNotifiable, OrderMessage::class, fn ($n) => $n->kind === 'completed');

        // Second order gets the next number.
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertJsonPath('data.order.number', 1002);
    }

    public function test_delivery_order_needs_a_covered_address_and_cancel_needs_a_reason(): void
    {
        Notification::fake();
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['type' => 'delivery', 'payment_method' => 'cod']), $this->site())
            ->assertStatus(422)->assertJsonValidationErrors(['address.line1', 'address.pincode']);
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['type' => 'delivery', 'payment_method' => 'cod', 'address' => ['line1' => '12 MG Road', 'pincode' => '110001']]), $this->site())
            ->assertStatus(422)->assertJsonPath('meta.code', 'outside_delivery_area');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['type' => 'delivery', 'payment_method' => 'counter', 'address' => ['line1' => '12 Karve Rd', 'pincode' => '411038']]), $this->site())
            ->assertStatus(422)->assertJsonPath('meta.code', 'payment_method_unavailable');

        $order = $this->postJson('/api/v1/site/orders', $this->orderPayload(['type' => 'delivery', 'payment_method' => 'cod', 'address' => ['line1' => '12 Karve Rd', 'pincode' => '411038']]), $this->site())
            ->assertCreated()
            ->assertJsonPath('data.order.address.pincode', '411038')
            ->assertJsonPath('data.order.total', '817.00') // + ₹30 delivery
            ->json('data.order');

        $this->actingAsUser($this->ownerOf($this->tenant));
        $internal = Order::withoutTenancy()->where('public_id', $order['id'])->value('id');
        $this->postJson("/api/v1/tenant/orders/{$internal}/status", ['status' => 'cancelled'])->assertStatus(422)->assertJsonPath('meta.code', 'reason_required');
        $this->postJson("/api/v1/tenant/orders/{$internal}/status", ['status' => 'cancelled', 'note' => 'Kitchen closed early'])->assertOk()->assertJsonPath('data.cancel_reason', 'Kitchen closed early');
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $this->tenant->id, 'action' => 'order.cancelled']);
        Notification::assertSentTo(new AnonymousNotifiable, OrderMessage::class, fn ($n) => $n->kind === 'cancelled' && str_contains($n->toText(), 'Kitchen closed early'));
    }

    public function test_ordering_rules_paused_types_and_opening_hours(): void
    {
        $this->asTenant(function () {
            $hours = app(TenantSettings::class)->get('opening_hours');
            app(TenantSettings::class)->set('opening_hours', array_map(fn () => ['closed' => false, 'open' => '18:00', 'close' => '23:00'], $hours));
        });
        // 1 pm: closed now → must schedule, within hours and the window.
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'closed_now');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['scheduled_for' => '2026-11-10T15:00:00+05:30']), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'closed_then');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['scheduled_for' => '2026-11-20T19:00:00+05:30']), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'too_far');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['scheduled_for' => '2026-11-10T19:30:00+05:30']), $this->site())
            ->assertCreated()->assertJsonPath('data.order.scheduled_for', '2026-11-10T14:00:00+00:00');

        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['accepting_orders'] = false;
            app(OrderingSettings::class)->save($s);
        });
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['scheduled_for' => '2026-11-10T19:30:00+05:30']), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'not_accepting');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['type' => 'dine_in']), $this->site())->assertStatus(422);
    }

    public function test_online_payment_with_razorpay_signature_and_webhook(): void
    {
        Notification::fake();
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['payments']['online'] = true;
            app(OrderingSettings::class)->save($s);
            app(OrderingSettings::class)->saveRazorpay('rzp_test_ABCDEF123456', 'secret_key_123456', 'whsec_7890');
        });
        Http::fake(['api.razorpay.com/v1/orders' => Http::response(['id' => 'order_TEST123', 'amount' => 78700, 'currency' => 'INR'])]);

        $res = $this->postJson('/api/v1/site/orders', $this->orderPayload(['payment_method' => 'online']), $this->site())
            ->assertCreated()
            ->assertJsonPath('data.order.payment_status', 'pending')
            ->assertJsonPath('data.razorpay.order_id', 'order_TEST123')
            ->assertJsonPath('data.razorpay.key_id', 'rzp_test_ABCDEF123456')
            ->assertJsonPath('data.razorpay.amount', 78700);
        Http::assertSent(fn ($r) => $r['amount'] === 78700 && $r->hasHeader('Authorization'));
        // Not paid yet → the kitchen isn't alerted, and staff can't start it.
        Notification::assertNothingSentTo($this->ownerOf($this->tenant));

        $id = $res->json('data.order.id');
        $token = $res->json('data.token');
        $verify = fn (string $sig) => $this->postJson("/api/v1/site/orders/{$id}/payment", ['t' => $token, 'razorpay_order_id' => 'order_TEST123', 'razorpay_payment_id' => 'pay_ABC', 'razorpay_signature' => $sig], $this->site());

        $verify('forged')->assertStatus(422)->assertJsonPath('meta.code', 'payment_unverified');
        $verify(hash_hmac('sha256', 'order_TEST123|pay_ABC', 'secret_key_123456'))->assertOk()->assertJsonPath('data.payment_status', 'paid');
        Notification::assertSentTo($this->ownerOf($this->tenant), NewOrderForStaff::class);

        // The webhook for the same payment is accepted once and changes nothing.
        $body = json_encode(['event' => 'payment.captured', 'payload' => ['payment' => ['entity' => ['id' => 'pay_ABC', 'order_id' => 'order_TEST123', 'method' => 'upi']]]]);
        $url = "/api/v1/webhooks/razorpay/{$this->tenant->public_id}";
        $this->call('POST', $url, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => 'bad'], $body)->assertStatus(400);
        $this->call('POST', $url, [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, 'whsec_7890')], $body)->assertOk();
        $this->assertSame(1, Payment::withoutTenancy()->where('status', 'captured')->count());
        Notification::assertSentToTimes($this->ownerOf($this->tenant), NewOrderForStaff::class, 1);

        // The secret never leaves the server.
        $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/ordering')
            ->assertJsonPath('data.razorpay.has_key_secret', true)
            ->assertJsonMissingPath('data.razorpay.key_secret')
            ->assertDontSee('secret_key_123456');
    }

    public function test_webhook_marks_paid_when_the_browser_never_came_back_and_unpaid_orders_expire(): void
    {
        Notification::fake();
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['payments']['online'] = true;
            app(OrderingSettings::class)->save($s);
            app(OrderingSettings::class)->saveRazorpay('rzp_test_ABCDEF123456', 'secret_key_123456', 'whsec_7890');
        });
        Http::fake(['api.razorpay.com/v1/orders' => Http::sequence()->push(['id' => 'order_A', 'amount' => 1, 'currency' => 'INR'])->push(['id' => 'order_B', 'amount' => 1, 'currency' => 'INR'])]);
        $a = $this->postJson('/api/v1/site/orders', $this->orderPayload(['payment_method' => 'online']), $this->site())->json('data.order.id');
        $b = $this->postJson('/api/v1/site/orders', $this->orderPayload(['payment_method' => 'online']), $this->site())->json('data.order.id');

        $body = json_encode(['event' => 'order.paid', 'payload' => ['payment' => ['entity' => ['id' => 'pay_A', 'order_id' => 'order_A']]]]);
        $this->call('POST', "/api/v1/webhooks/razorpay/{$this->tenant->public_id}", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, 'whsec_7890')], $body)->assertOk();
        $this->assertSame('paid', Order::withoutTenancy()->where('public_id', $a)->value('payment_status'));

        $this->travel(31)->minutes();
        $this->artisan('orders:expire-unpaid')->assertSuccessful();
        $this->assertSame('pending', Order::withoutTenancy()->where('public_id', $a)->value('status'));
        $this->assertSame('cancelled', Order::withoutTenancy()->where('public_id', $b)->value('status'));
    }

    public function test_orders_are_isolated_between_businesses(): void
    {
        Notification::fake();
        $id = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->json('data.order.id');
        $token = Order::withoutTenancy()->where('public_id', $id)->value('tracking_token');
        $internal = Order::withoutTenancy()->where('public_id', $id)->value('id');

        $other = $this->business('Cafe Sol', 'growth', ['status' => 'live']);
        // Another business's site can't show it, even with the right token.
        $this->getJson("/api/v1/site/orders/{$id}?t={$token}", ['X-Tenant-Host' => $this->host($other)])->assertNotFound();
        // Another business's staff can't see or change it.
        $this->actingAsUser($this->ownerOf($other));
        $this->getJson("/api/v1/tenant/orders/{$internal}")->assertNotFound();
        $this->postJson("/api/v1/tenant/orders/{$internal}/status", ['status' => 'confirmed'])->assertNotFound();
        $this->getJson('/api/v1/tenant/orders?view=all')->assertJsonCount(0, 'data');
        // A cart can't use another business's dishes.
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 1]]], ['X-Tenant-Host' => $this->host($other)])
            ->assertStatus(422)->assertJsonPath('meta.code', 'item_missing');

        $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/orders?view=all')->assertJsonCount(1, 'data');
        // Search: by name or phone; a name with no match finds nothing (not every order).
        $this->getJson('/api/v1/tenant/orders?view=all&search=asha')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/tenant/orders?view=all&search=12345')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/tenant/orders?view=all&search=ravi')->assertJsonCount(0, 'data');
    }

    public function test_staff_feed_reports_new_orders_for_the_alert_sound(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/orders/feed?after=0')->assertJsonPath('data.latest_id', 0)->assertJsonCount(0, 'data.new');
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/orders/feed?after=0')
            ->assertJsonCount(1, 'data.new')
            ->assertJsonPath('data.new.0.number', 1001)
            ->assertJsonPath('data.counts.pending', 1)
            ->assertJsonPath('data.unread', 1);
        $this->postJson('/api/v1/tenant/notifications/read')->assertOk();
        $this->getJson('/api/v1/tenant/orders/feed?after=0')->assertJsonPath('data.unread', 0);
    }
}
