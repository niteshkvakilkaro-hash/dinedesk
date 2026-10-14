<?php

namespace Tests\Feature\Saas;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Referrals\Models\ReferralReward;
use App\Modules\Referrals\Notifications\ReferralRewardEarned;
use App\Modules\Referrals\Services\ReferralCodes;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

/**
 * Refer a business: codes, sign-up with ?ref=, both businesses rewarded once on the referred
 * business's first paid payment, free days only where nothing renews on Razorpay.
 * Spice Route ($this->tenant, on a 14-day trial) is the referrer.
 */
class ReferralTest extends SaasTestCase
{
    private function signUp(?string $code, string $name = 'Chai Point'): Tenant
    {
        $this->actingAsUser($this->user())->postJson('/api/v1/onboarding/business', [
            'business_type' => 'cafe', 'name' => $name, 'city' => 'Jaipur', 'opening_hours' => OpeningHours::default(), 'referral_code' => $code,
        ])->assertCreated();

        return Tenant::where('name', $name)->sole();
    }

    private function sub(Tenant $t): Subscription
    {
        return Subscription::withoutTenancy()->where('tenant_id', $t->id)->orderByDesc('id')->first();
    }

    /** The referred business pays its first charge on Razorpay (webhook). */
    private function pay(Tenant $t, string $paymentId = 'pay_R1'): void
    {
        $this->sub($t)->update(['status' => 'pending', 'provider' => 'razorpay', 'provider_subscription_id' => 'sub_R']);
        $this->webhook('subscription.charged', $this->subEntity('sub_R', 'plan_G_M', now()->getTimestamp(), now()->addMonth()->getTimestamp())
            + ['payment' => ['entity' => ['id' => $paymentId, 'amount' => 235882]]])->assertOk();
    }

    public function test_every_business_gets_a_unique_readable_code_and_demos_none(): void
    {
        $code = $this->tenant->fresh()->referral_code;
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $code);
        $other = $this->business('Cafe Sol');
        $this->assertNotSame($code, $other->referral_code);
        $this->assertSame($code, ReferralCodes::normalize(' '.strtolower(substr($code, 0, 4)).'-'.substr($code, 4)));
        $this->assertNull(ReferralCodes::normalize('ABCD1234')); // "1" is never used

        // Created on first use for a business that has none (e.g. made before referrals).
        $other->update(['referral_code' => null]);
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/referrals')->assertOk()
            ->assertJsonPath('data.available', true)->assertJsonPath('data.reward_days', 30);
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $other->fresh()->referral_code);

        $demo = $this->business('Demo Cafe', 'growth', ['is_demo' => true]);
        $this->actingAsUser($this->ownerOf($demo))->getJson('/api/v1/tenant/referrals')->assertOk()
            ->assertJsonPath('data.available', false)->assertJsonPath('data.code', null);
    }

    public function test_sign_up_with_a_valid_code_records_the_referrer_and_bad_codes_are_ignored(): void
    {
        $code = $this->tenant->fresh()->referral_code;
        $referred = $this->signUp(strtolower($code));
        $this->assertSame($this->tenant->id, $referred->referred_by_tenant_id);
        $this->assertTrue(AuditLog::where('action', 'referral.new_signup')->where('tenant_id', $this->tenant->id)->exists());

        $this->assertNull($this->signUp('ZZZZZZZZ', 'Nowhere Cafe')->referred_by_tenant_id);
        $this->assertNull($this->signUp(str_repeat('x', 20), 'Long Code Cafe')->referred_by_tenant_id);
        $demo = $this->business('Demo Cafe', 'growth', ['is_demo' => true]);
        $this->assertNull($this->signUp($demo->referral_code, 'Via Demo')->referred_by_tenant_id);
        $branch = $this->business('Spice Route Annex', 'growth', ['parent_tenant_id' => $this->tenant->id]);
        $this->assertNull($this->signUp($branch->referral_code, 'Via Branch')->referred_by_tenant_id);

        // A business can't refer itself.
        $self = $this->business('Loop Cafe');
        app(ReferralRewards::class)->recordSignup($self, $this->ownerOf($self), $self->referral_code);
        $this->assertNull($self->fresh()->referred_by_tenant_id);
    }

    public function test_first_paid_payment_rewards_both_once_trial_extended_renewing_plan_pending(): void
    {
        Notification::fake();
        $trialEnd = CarbonImmutable::parse($this->sub($this->tenant)->trial_ends_at);
        $referred = $this->signUp($this->tenant->fresh()->referral_code);

        // Signing up alone earns nothing.
        $this->assertSame(0, ReferralReward::count());
        $this->pay($referred);
        $this->pay($referred); // webhook delivered again
        $this->webhook('subscription.charged', $this->subEntity('sub_R', 'plan_G_M', now()->addMonth()->getTimestamp(), now()->addMonths(2)->getTimestamp())
            + ['payment' => ['entity' => ['id' => 'pay_R2', 'amount' => 235882]]])->assertOk(); // the renewal

        $this->assertSame(2, ReferralReward::count());
        $this->assertNotNull($referred->fresh()->referral_rewarded_at);

        // Referrer on trial: the trial end moves by 30 days.
        $mine = ReferralReward::where('tenant_id', $this->tenant->id)->sole();
        $this->assertSame(['referrer', 30, 'applied', 'trial'], [$mine->role, $mine->days, $mine->status, $mine->applied_to]);
        $this->assertEqualsWithDelta($trialEnd->addDays(30)->getTimestamp(), $this->sub($this->tenant)->trial_ends_at->getTimestamp(), 2);

        // The referred business renews on Razorpay: its days wait (nothing claimed that isn't given).
        $theirs = ReferralReward::where('tenant_id', $referred->id)->sole();
        $this->assertSame(['referred', 'pending', null], [$theirs->role, $theirs->status, $theirs->applied_to]);
        $this->assertSame('active', $this->sub($referred)->status);
        $periodEnd = $this->sub($referred)->current_period_ends_at->toImmutable();

        $this->assertSame(2, AuditLog::where('action', 'referral.reward_granted')->count());
        Notification::assertSentToTimes($this->owner(), ReferralRewardEarned::class, 1);
        Notification::assertSentTo($this->owner(), ReferralRewardEarned::class, fn ($n) => str_contains($n->subject, 'Chai Point') && str_contains($n->lines[1], 'trial'));

        // The hourly job leaves a renewing plan alone.
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame('pending', $theirs->fresh()->status);

        // Cancelled: it won't renew, so the paid period is extended instead.
        Http::fake(['api.razorpay.com/v1/subscriptions/sub_R/cancel' => Http::response(['id' => 'sub_R', 'status' => 'active'])]);
        $this->actingAsUser($this->ownerOf($referred))->postJson('/api/v1/tenant/subscription/cancel')->assertOk();
        $this->assertSame(['applied', 'period'], [$theirs->fresh()->status, $theirs->fresh()->applied_to]);
        $this->assertEqualsWithDelta($periodEnd->addDays(30)->getTimestamp(), $this->sub($referred)->current_period_ends_at->getTimestamp(), 2);
        // ... and Razorpay's "cancelled" at the original cycle end keeps the extension.
        $this->webhook('subscription.cancelled', $this->subEntity('sub_R', 'plan_G_M', now()->getTimestamp(), now()->addMonth()->getTimestamp()))->assertOk();
        $this->assertEqualsWithDelta($periodEnd->addDays(30)->getTimestamp(), $this->sub($referred)->current_period_ends_at->getTimestamp(), 2);
    }

    public function test_a_lapsed_trial_becomes_a_trial_again_and_read_only_is_lifted(): void
    {
        $referred = $this->signUp($this->tenant->fresh()->referral_code);
        $this->travel(22)->days();
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame('read_only', $this->tenant->fresh()->status);

        Notification::fake();
        $this->owner()->update(['locale' => 'hi']);
        $this->pay($referred);
        $s = $this->sub($this->tenant);
        $this->assertSame('trialing', $s->status);
        $this->assertNull($s->grace_ends_at);
        $this->assertEqualsWithDelta(now()->addDays(30)->getTimestamp(), $s->trial_ends_at->getTimestamp(), 2);
        $this->assertSame('live', $this->tenant->fresh()->status);
        // The owner's email is in their dashboard language.
        Notification::assertSentTo($this->owner(), ReferralRewardEarned::class, fn ($n, $channels) => str_contains($n->subject, 'मुफ़्त') && str_contains($n->lines[1], 'ट्रायल') && in_array('mail', $channels, true));
    }

    public function test_a_referrer_on_a_renewing_plan_waits_and_the_super_admin_can_mark_it_applied(): void
    {
        $this->sub($this->tenant)->update(['status' => 'active', 'provider' => 'razorpay', 'provider_subscription_id' => 'sub_SR', 'current_period_ends_at' => now()->addDays(10)]);
        $referred = $this->signUp($this->tenant->fresh()->referral_code);
        $this->pay($referred);
        $mine = ReferralReward::where('tenant_id', $this->tenant->id)->sole();
        $this->assertSame('pending', $mine->status);
        $this->assertEqualsWithDelta(now()->addDays(10)->getTimestamp(), $this->sub($this->tenant)->current_period_ends_at->getTimestamp(), 2);

        $this->actingAsUser($this->owner())->getJson('/api/v1/tenant/referrals')->assertOk()
            ->assertJsonPath('data.stats', ['signed_up' => 1, 'paying' => 1, 'days_earned' => 30, 'days_pending' => 30]);

        $url = "/api/v1/platform/tenants/{$this->tenant->public_id}/referral-rewards/{$mine->id}/applied";
        $this->actingAsUser($this->owner())->postJson($url, ['note' => 'Refunded 30 days'])->assertForbidden();
        $this->actingAsUser($this->admin)->postJson($url, ['note' => 'no'])->assertStatus(422);
        $this->actingAsUser($this->admin)->postJson($url, ['note' => 'Refunded one month on Razorpay'])->assertOk()
            ->assertJsonPath('data.rewards.0.status', 'applied')->assertJsonPath('data.rewards.0.applied_to', 'manual');
        $this->actingAsUser($this->admin)->postJson($url, ['note' => 'Refunded one month on Razorpay'])->assertStatus(422)->assertJsonPath('meta.code', 'already_applied');
        $this->assertTrue(AuditLog::where('action', 'platform.referral_reward.applied')->where('tenant_id', $this->tenant->id)->exists());
    }

    public function test_owner_page_shows_names_and_progress_only_and_staff_cannot_see_it(): void
    {
        $code = $this->tenant->fresh()->referral_code;
        $this->signUp($code, 'Chai Point');
        $paying = $this->signUp($code, 'Dosa Hut');
        $this->pay($paying);

        $this->actingAsUser($this->staff($this->tenant, 'manager'))->getJson('/api/v1/tenant/referrals')->assertForbidden();
        $res = $this->actingAsUser($this->owner())->getJson('/api/v1/tenant/referrals')->assertOk()
            ->assertJsonPath('data.code', $code)
            ->assertJsonPath('data.stats.signed_up', 2)->assertJsonPath('data.stats.paying', 1)->assertJsonPath('data.stats.days_earned', 30)
            ->assertJsonPath('data.businesses.0.name', 'Dosa Hut')->assertJsonPath('data.businesses.0.status', 'paying')
            ->assertJsonPath('data.businesses.1.status', 'signed_up');
        $this->assertSame(['name', 'status', 'joined_at'], array_keys($res->json('data.businesses.0')));
        $this->assertArrayNotHasKey('id', $res->json('data.rewards.0'));

        // The referred business sees who invited it.
        $this->actingAsUser($this->ownerOf($paying))->getJson('/api/v1/tenant/referrals')->assertJsonPath('data.referred_by', 'Spice Route');
    }

    public function test_public_lookup_returns_only_the_name_and_404_for_invalid_or_demo_codes(): void
    {
        $code = $this->tenant->fresh()->referral_code;
        $this->getJson('/api/v1/referrals/'.strtolower($code))->assertOk()->assertExactJson(['data' => ['name' => 'Spice Route'], 'message' => null, 'errors' => null, 'meta' => null]);
        $this->getJson('/api/v1/referrals/ZZZZZZZZ')->assertNotFound();
        $demo = $this->business('Demo Cafe', 'growth', ['is_demo' => true]);
        $this->getJson("/api/v1/referrals/{$demo->referral_code}")->assertNotFound();
        $this->tenant->update(['status' => 'suspended']);
        $this->getJson("/api/v1/referrals/{$code}")->assertNotFound();

        for ($i = 0; $i < 17; $i++) {
            $this->getJson('/api/v1/referrals/ZZZZZZZZ');
        }
        $this->getJson('/api/v1/referrals/ZZZZZZZZ')->assertStatus(429);
    }

    public function test_super_admin_sees_code_referrer_referred_businesses_and_rewards(): void
    {
        $referred = $this->signUp($this->tenant->fresh()->referral_code);
        $this->pay($referred);

        $this->actingAsUser($this->admin)->getJson("/api/v1/platform/tenants/{$this->tenant->public_id}")->assertOk()
            ->assertJsonPath('data.referrals.code', $this->tenant->fresh()->referral_code)
            ->assertJsonPath('data.referrals.referred_by', null)
            ->assertJsonPath('data.referrals.referred.0.name', 'Chai Point')->assertJsonPath('data.referrals.referred.0.paying', true)
            ->assertJsonPath('data.referrals.rewards.0.role', 'referrer')->assertJsonPath('data.referrals.rewards.0.status', 'applied');
        $this->actingAsUser($this->admin)->getJson("/api/v1/platform/tenants/{$referred->public_id}")->assertOk()
            ->assertJsonPath('data.referrals.referred_by.name', 'Spice Route')
            ->assertJsonPath('data.referrals.rewards.0.status', 'pending');
        $this->actingAsUser($this->admin)->getJson('/api/v1/platform/tenants')->assertJsonPath('meta.summary.referral_credits_pending', 1);
    }
}
