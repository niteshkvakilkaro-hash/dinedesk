<?php

namespace Tests\Feature\Saas;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Subscriptions\Models\PlatformInvoice;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\Http;

/** Razorpay subscriptions, invoices with GST, grace and read-only, upgrades and downgrades. */
class SubscriptionTest extends SaasTestCase
{
    public function test_subscribe_pay_invoice_lapse_read_only_and_back(): void
    {
        Http::fake([
            'api.razorpay.com/v1/plans' => Http::response(['id' => 'plan_G_M', 'period' => 'monthly']),
            'api.razorpay.com/v1/subscriptions' => Http::response(['id' => 'sub_1', 'short_url' => 'https://rzp.io/i/x', 'status' => 'created']),
        ]);
        $owner = $this->owner();
        // A manager can't touch billing.
        $this->actingAsUser($this->staff($this->tenant, 'manager'))->getJson('/api/v1/tenant/subscription')->assertForbidden();

        $show = $this->actingAsUser($owner)->getJson('/api/v1/tenant/subscription')->assertOk()
            ->assertJsonPath('data.subscription.status', 'trialing')->assertJsonPath('data.payments_ready', true)->json('data');
        $this->assertSame('2358.82', collect($show['plans'])->firstWhere('code', 'growth')['charge_monthly']);

        // ₹1,999 + 18% GST = ₹2,358.82 a month.
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/checkout', ['plan' => 'growth', 'cycle' => 'monthly'])
            ->assertOk()->assertJsonPath('data.subscription_id', 'sub_1')->assertJsonPath('data.amount', 235882)->assertJsonPath('data.key_id', 'rzp_test_PLATFORM');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/plans') && $r['item']['amount'] === 235882);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/subscriptions') && $r['plan_id'] === 'plan_G_M');

        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/verify', ['razorpay_payment_id' => 'pay_1', 'razorpay_subscription_id' => 'sub_1', 'razorpay_signature' => 'forged'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'payment_unverified');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/verify', ['razorpay_payment_id' => 'pay_1', 'razorpay_subscription_id' => 'sub_1', 'razorpay_signature' => hash_hmac('sha256', 'pay_1|sub_1', 'plat_secret')])
            ->assertOk()->assertJsonPath('data.status', 'active');
        $this->assertSame('expired', Subscription::withoutTenancy()->where('tenant_id', $this->tenant->id)->orderBy('id')->first()->status);

        // The charge webhook makes the invoice once: CGST + SGST (buyer has no GSTIN → seller's state).
        $start = now()->getTimestamp();
        $charged = $this->subEntity('sub_1', 'plan_G_M', $start, now()->addMonth()->getTimestamp()) + ['payment' => ['entity' => ['id' => 'pay_1', 'amount' => 235882]]];
        $this->webhook('subscription.charged', $charged)->assertOk();
        $this->webhook('subscription.charged', $charged)->assertOk();
        $this->call('POST', '/api/v1/webhooks/razorpay-platform', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => 'bad'], '{}')->assertStatus(400);
        $inv = PlatformInvoice::withoutTenancy()->sole();
        $this->assertSame(['DD/2026-27/0001', '1999.00', '179.91', '179.91', '0.00', '2358.82', '998315'], [$inv->number, $inv->taxable_value, $inv->cgst, $inv->sgst, $inv->igst, $inv->total, $inv->sac]);
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/subscription')->assertJsonCount(1, 'data.invoices');
        $this->actingAsUser($owner)->get("/api/v1/tenant/subscription/invoices/{$inv->public_id}")->assertOk()->assertHeader('content-type', 'application/pdf');

        // The card fails: a grace period, then read-only (data kept, can still view, export and pay).
        $this->webhook('subscription.halted', $this->subEntity('sub_1', 'plan_G_M', $start, now()->addMonth()->getTimestamp()))->assertOk();
        $this->assertSame('halted', Subscription::withoutTenancy()->where('provider_subscription_id', 'sub_1')->value('status'));
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame('live', $this->tenant->fresh()->status);
        $this->travel(8)->days();
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame('read_only', $this->tenant->fresh()->status);
        $owner = $this->owner();
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/menu/categories', ['name' => 'Soups'])->assertForbidden()->assertJsonPath('meta.code', 'tenant_read_only');
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/menu')->assertOk();
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/subscription')->assertOk()->assertJsonPath('data.business_status', 'read_only');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/exports')->assertCreated();
        $this->assertTrue(AuditLog::where('action', 'billing.read_only')->exists());

        // Paid again: back to normal.
        $this->webhook('subscription.charged', $this->subEntity('sub_1', 'plan_G_M', now()->getTimestamp(), now()->addMonth()->getTimestamp()) + ['payment' => ['entity' => ['id' => 'pay_2', 'amount' => 235882]]])->assertOk();
        $this->assertSame('live', $this->tenant->fresh()->status);
        $owner = $this->owner();
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/menu/categories', ['name' => 'Soups', 'is_active' => true])->assertCreated();
        $this->assertSame(2, PlatformInvoice::withoutTenancy()->count());
    }

    public function test_trial_ends_grace_then_read_only_but_demo_businesses_are_left_alone(): void
    {
        $demo = $this->business('Demo Cafe', 'growth', ['status' => 'live', 'is_demo' => true]);
        $this->travel(15)->days();
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $s = Subscription::withoutTenancy()->where('tenant_id', $this->tenant->id)->latest('id')->first();
        $this->assertSame('past_due', $s->status);
        $this->assertNotNull($s->grace_ends_at);
        $this->assertSame('live', $this->tenant->fresh()->status);

        $this->travel(7)->days();
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame(['read_only', 'live'], [$this->tenant->fresh()->status, $demo->fresh()->status]);
        $this->actingAsUser($this->owner())->getJson('/api/v1/auth/me')->assertJsonPath('data.tenant.status', 'read_only');
    }

    public function test_upgrades_apply_now_downgrades_at_period_end_and_cancel_keeps_the_period(): void
    {
        Subscription::withoutTenancy()->where('tenant_id', $this->tenant->id)->update(['status' => 'active', 'provider' => 'razorpay', 'provider_subscription_id' => 'sub_9', 'current_period_ends_at' => now()->addDays(20)]);
        Http::fake([
            'api.razorpay.com/v1/plans' => Http::sequence()->push(['id' => 'plan_PRO_M'])->push(['id' => 'plan_ST_M']),
            'api.razorpay.com/v1/subscriptions/sub_9' => Http::response(['id' => 'sub_9']),
            'api.razorpay.com/v1/subscriptions/sub_9/cancel' => Http::response(['id' => 'sub_9', 'status' => 'active']),
        ]);
        $owner = $this->owner();
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/checkout', ['plan' => 'pro', 'cycle' => 'monthly'])->assertStatus(422)->assertJsonPath('meta.code', 'already_subscribed');

        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/change', ['plan' => 'pro', 'cycle' => 'monthly'])->assertOk()->assertJsonPath('data.plan.code', 'pro');
        Http::assertSent(fn ($r) => $r->method() === 'PATCH' && $r['schedule_change_at'] === 'now');
        $owner = $this->owner();
        $this->actingAsUser($owner)->getJson('/api/v1/auth/me')->assertJsonPath('data.features.hotel', true);

        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/change', ['plan' => 'starter', 'cycle' => 'monthly'])->assertOk()
            ->assertJsonPath('data.plan.code', 'pro')->assertJsonPath('data.scheduled_plan.code', 'starter');
        Http::assertSent(fn ($r) => $r->method() === 'PATCH' && $r['schedule_change_at'] === 'cycle_end');
        // The next period is charged on the new plan: Starter from now on.
        $this->webhook('subscription.charged', $this->subEntity('sub_9', 'plan_ST_M', now()->addDays(20)->getTimestamp(), now()->addDays(50)->getTimestamp()) + ['payment' => ['entity' => ['id' => 'pay_9', 'amount' => 117882]]])->assertOk();
        $this->assertSame('starter', $this->tenant->fresh()->plan->code);
        $owner = $this->owner();
        $this->actingAsUser($owner)->getJson('/api/v1/auth/me')->assertJsonPath('data.features.pos', false);

        $this->actingAsUser($owner)->postJson('/api/v1/tenant/subscription/cancel')->assertOk()->assertJsonPath('data.cancel_at_period_end', true);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/cancel') && $r['cancel_at_cycle_end'] === 1);
    }

    public function test_no_checkout_without_a_price_or_payment_keys(): void
    {
        Plan::where('code', 'pro')->update(['price_monthly' => null]);
        $this->actingAsUser($this->owner())->postJson('/api/v1/tenant/subscription/checkout', ['plan' => 'pro', 'cycle' => 'monthly'])->assertStatus(422)->assertJsonPath('meta.code', 'not_priced');
        config(['dinedesk.platform_razorpay.key_id' => null]);
        $this->actingAsUser($this->owner())->getJson('/api/v1/tenant/subscription')->assertJsonPath('data.payments_ready', false);
        $this->actingAsUser($this->owner())->postJson('/api/v1/tenant/subscription/checkout', ['plan' => 'growth', 'cycle' => 'yearly'])->assertStatus(422)->assertJsonPath('meta.code', 'billing_unavailable');
        // No GSTIN on the platform → no GST added.
        $this->actingAsUser($this->admin)->putJson('/api/v1/platform/settings', ['seller' => ['gstin' => null, 'invoice_prefix' => 'DD'], 'billing' => ['grace_days' => 7, 'gst_rate' => 18, 'sac' => '998315']])->assertOk();
        $this->actingAsUser($this->owner())->getJson('/api/v1/tenant/subscription')->assertJsonPath('data.gst_rate', 0);
        $this->assertNull(Tenant::find($this->tenant->id)->parent_tenant_id);
    }
}
