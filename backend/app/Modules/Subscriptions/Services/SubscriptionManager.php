<?php

namespace App\Modules\Subscriptions\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantScope;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Business subscriptions on Razorpay Subscriptions.
 *
 *  trialing ─(trial ends)→ past_due + grace ─(grace ends)→ business read-only
 *  pending (checkout started) ─(paid)→ active ─(renewal charged)→ active
 *  during a trial: pending ─(authorised)→ scheduled ─(first charge at trial end)→ active
 *    (Razorpay start_at = trial end, so the days left of the trial are not lost)
 *  active ─(payment fails)→ past_due / halted + grace ─(grace ends)→ read-only
 *  active ─(cancel)→ cancelled at period end → grace → read-only
 * Paying again at any point makes the business (and its branches) normal again.
 * Upgrades apply at once; downgrades and cycle changes at the end of the period.
 */
class SubscriptionManager
{
    /** Razorpay webhook events the platform handles (enable these in the Razorpay dashboard). */
    public const WEBHOOK_EVENTS = [
        'subscription.authenticated', 'subscription.activated', 'subscription.charged', 'subscription.pending',
        'subscription.halted', 'subscription.cancelled', 'subscription.completed',
    ];

    public function __construct(
        private readonly PlatformRazorpay $razorpay,
        private readonly PlatformSettings $settings,
        private readonly PlatformInvoices $invoices,
        private readonly TenantAccess $access,
        private readonly ReferralRewards $referrals,
    ) {}

    public function current(Tenant $root): ?Subscription
    {
        return Subscription::withoutGlobalScope(TenantScope::class)->where('tenant_id', $root->id)->orderByDesc('id')->first();
    }

    /** What a cycle of a plan costs, in paise, GST included when the platform charges GST. */
    public function amountPaise(Plan $plan, string $cycle): ?int
    {
        $price = $cycle === 'yearly' ? $plan->price_yearly : $plan->price_monthly;
        if ($price === null || (float) $price <= 0) {
            return null;
        }

        return (int) round((float) $price * 100 * (1 + $this->settings->gstRate() / 100));
    }

    /**
     * Start paying for a plan: a Razorpay subscription the owner authorises in Checkout.
     * With a live subscription already, this is a plan change instead.
     */
    public function checkout(Tenant $root, string $code, string $cycle, User $by): array
    {
        $plan = $this->plan($code);
        $current = $this->current($root);
        if ($current && $current->status === 'active' && $current->provider_subscription_id) {
            throw new ApiException('You already have an active subscription. Change your plan instead.', 422, 'already_subscribed');
        }
        if ($current && $current->status === 'scheduled') {
            throw new ApiException('Your plan is already set to start when your trial ends. Cancel it first to choose another one.', 422, 'already_scheduled');
        }
        $rzpPlan = $this->razorpayPlan($plan, $cycle);
        if ($current && $current->status === 'pending' && $current->starts_at) {
            // An earlier checkout that was never completed is replaced below, so free days that
            // waited for its start date can go to the trial first (and the new start uses them).
            $current->update(['starts_at' => null]);
            $this->referrals->applyPending($root);
            $current = $current->fresh();
        }
        // Still on a trial: the first charge waits for its end (the trial days, referral days
        // included, are kept). An hour of margin: Razorpay needs a start in the future.
        $startsAt = $this->trialLeft($current);
        $sub = $this->razorpay->createSubscription($rzpPlan, $cycle, ['business' => $root->public_id, 'plan' => $plan->code], $startsAt?->getTimestamp());

        $row = DB::transaction(function () use ($root, $current, $plan, $cycle, $sub, $startsAt) {
            $fields = [
                'plan_id' => $plan->id,
                'billing_cycle' => $cycle,
                'status' => 'pending',
                'starts_at' => $startsAt,
                'provider' => 'razorpay',
                'provider_subscription_id' => $sub['id'],
                'checkout_url' => $sub['short_url'],
                'scheduled_plan_id' => null,
                'cancel_at_period_end' => false,
            ];
            if ($current && $current->status === 'pending') {
                $current->update($fields);

                return $current;
            }

            // A new row; it keeps the deadlines of the one before (trial end, grace) until paid.
            return Subscription::withoutGlobalScope(TenantScope::class)->create($fields + [
                'tenant_id' => $root->id,
                'trial_ends_at' => $current?->trial_ends_at,
                'current_period_ends_at' => $current?->current_period_ends_at,
                'grace_ends_at' => $current?->grace_ends_at,
            ]);
        });
        AuditLog::record('billing.checkout', $root, ['plan' => $plan->code, 'cycle' => $cycle], $root->id);

        return [
            'key_id' => $this->razorpay->keyId(),
            'subscription_id' => $sub['id'],
            'name' => config('app.name'),
            'description' => "{$plan->name} plan, {$cycle}",
            'amount' => $this->amountPaise($plan, $cycle),
            'prefill' => ['name' => $by->name, 'email' => $by->email, 'contact' => $by->phone],
            'subscription' => $this->present($row->fresh(['plan', 'scheduledPlan'])),
        ];
    }

    /** Checkout came back: accept it only with a valid signature. */
    public function verify(Tenant $root, string $paymentId, string $subscriptionId, string $signature): Subscription
    {
        $sub = Subscription::withoutGlobalScope(TenantScope::class)->where('tenant_id', $root->id)->where('provider_subscription_id', $subscriptionId)->first();
        if (! $sub || ! $this->razorpay->checkoutSignatureValid($paymentId, $subscriptionId, $signature)) {
            throw new ApiException('We could not verify this payment. If money was deducted, it will be confirmed automatically.', 422, 'payment_unverified');
        }
        if ($sub->starts_at && $sub->starts_at->isFuture()) {
            // Authorised, first charge at the end of the trial: still on the trial until then.
            $this->authorised($sub);
        } elseif ($sub->status !== 'active') {
            $start = CarbonImmutable::now();
            $this->activate($sub, $start, $sub->billing_cycle === 'yearly' ? $start->addYear() : $start->addMonth());
        }

        return $sub->fresh();
    }

    /** Razorpay subscription webhooks (signature already checked). Repeats are harmless. */
    public function webhook(string $event, array $payload): void
    {
        $entity = (array) ($payload['subscription']['entity'] ?? []);
        $sub = isset($entity['id']) ? Subscription::withoutGlobalScope(TenantScope::class)->where('provider_subscription_id', $entity['id'])->first() : null;
        if (! $sub) {
            return;
        }
        $start = isset($entity['current_start']) ? CarbonImmutable::createFromTimestamp((int) $entity['current_start']) : null;
        $end = isset($entity['current_end']) ? CarbonImmutable::createFromTimestamp((int) $entity['current_end']) : null;

        match ($event) {
            // The owner authorised a subscription that starts later (Checkout closed before verify, too).
            'subscription.authenticated' => $this->authorised($sub),
            'subscription.activated' => $this->activate($sub, $start, $end),
            'subscription.charged' => $this->charged($sub, (array) ($payload['payment']['entity'] ?? []), $start, $end, $entity['plan_id'] ?? null),
            'subscription.pending', 'subscription.halted' => $this->lapse($sub, $event === 'subscription.halted' ? 'halted' : 'past_due'),
            'subscription.cancelled', 'subscription.completed' => $this->ended($sub),
            default => null,
        };
    }

    /**
     * Change plan or cycle on a live subscription. Upgrades (more per month) apply now;
     * downgrades and cycle changes from the next period.
     */
    public function changePlan(Tenant $root, string $code, string $cycle): Subscription
    {
        $plan = $this->plan($code);
        $sub = $this->current($root);
        if (! $sub || $sub->status !== 'active' || ! $sub->provider_subscription_id) {
            throw new ApiException('Subscribe first to change plans.', 422, 'not_subscribed');
        }
        $from = $sub->plan()->first();
        if ($from->id === $plan->id && $sub->billing_cycle === $cycle) {
            throw new ApiException('You are already on this plan.', 422, 'same_plan');
        }
        $upgrade = $plan->monthlyValue($cycle) > $from->monthlyValue($sub->billing_cycle) && $cycle === $sub->billing_cycle;
        $this->razorpay->changePlan($sub->provider_subscription_id, $this->razorpayPlan($plan, $cycle), $upgrade);
        if ($upgrade) {
            $sub->update(['plan_id' => $plan->id, 'scheduled_plan_id' => null]);
            $this->access->setPlan($root, $plan->id);
        } else {
            // Takes effect with the first charge of the next period (see charged()).
            $sub->update(['scheduled_plan_id' => $plan->id]);
        }
        AuditLog::record($upgrade ? 'billing.upgraded' : 'billing.downgrade_scheduled', $root, ['from' => $from->code, 'to' => $plan->code, 'cycle' => $cycle], $root->id);

        return $sub->fresh(['plan', 'scheduledPlan']);
    }

    /** Stop renewing; the plan stays until the end of the paid period. */
    public function cancel(Tenant $root): Subscription
    {
        $sub = $this->current($root);
        if ($sub && $sub->status === 'scheduled') {
            return $this->cancelScheduled($root, $sub);
        }
        if (! $sub || $sub->status !== 'active' || ! $sub->provider_subscription_id) {
            throw new ApiException('There is no active subscription to cancel.', 422, 'not_subscribed');
        }
        $this->razorpay->cancel($sub->provider_subscription_id, true);
        $sub->update(['cancel_at_period_end' => true]);
        AuditLog::record('billing.cancel_requested', $root, ['ends' => $sub->current_period_ends_at?->toIso8601String()], $root->id);
        // It won't renew now, so referral free days waiting for that can extend the period.
        $this->referrals->applyPending($root);

        return $sub->fresh(['plan', 'scheduledPlan']);
    }

    /**
     * Hourly: trials and paid periods that ran out get a grace period; when the grace period
     * ends without payment, the business and its branches become read-only. Demo businesses
     * are left alone.
     */
    public function enforce(): array
    {
        $graceDays = (int) $this->settings->get('billing')['grace_days'];
        // Referral free days that can be added by now (a trial, a plan that won't renew) first.
        $done = ['grace' => 0, 'read_only' => 0, 'referral_credits' => $this->referrals->applyAllPending()];
        Tenant::whereNull('parent_tenant_id')->where('is_demo', false)->whereIn('status', ['live', 'onboarding', 'read_only'])->each(function (Tenant $t) use ($graceDays, &$done) {
            $s = $this->current($t);
            if (! $s) {
                return;
            }
            $now = CarbonImmutable::now();
            $lapsedAt = match (true) {
                // A scheduled plan is charged when the trial ends; until that charge arrives it is the trial that ran out.
                in_array($s->status, ['trialing', 'pending', 'scheduled'], true) && $s->trial_ends_at && $s->trial_ends_at->lte($now) => $s->trial_ends_at,
                $s->status === 'cancelled' && $s->current_period_ends_at && $s->current_period_ends_at->lte($now) => $s->current_period_ends_at,
                // A renewal that never arrived (3 days of slack for the provider).
                $s->status === 'active' && $s->current_period_ends_at && $s->current_period_ends_at->addDays(3)->lte($now) => $s->current_period_ends_at,
                default => null,
            };
            if ($lapsedAt && ! $s->grace_ends_at) {
                $s->update(['grace_ends_at' => CarbonImmutable::parse($lapsedAt)->addDays($graceDays), 'status' => $s->status === 'active' || $s->status === 'trialing' ? 'past_due' : $s->status]);
                AuditLog::record('billing.grace_started', $t, ['until' => $s->grace_ends_at->toIso8601String()], $t->id);
                $done['grace']++;
            }
            if ($s->status !== 'active' && $s->grace_ends_at && $s->grace_ends_at->lte($now) && $t->status !== 'read_only') {
                $this->access->readOnly($t, 'Payment not received after the grace period');
                $done['read_only']++;
            }
        });

        return $done;
    }

    public function present(?Subscription $s): ?array
    {
        if (! $s) {
            return null;
        }
        $s->loadMissing(['plan', 'scheduledPlan']);

        return [
            'status' => $s->status,
            'plan' => ['code' => $s->plan->code, 'name' => $s->plan->name],
            'billing_cycle' => $s->billing_cycle,
            'trial_ends_at' => $s->trial_ends_at?->toIso8601String(),
            // Scheduled: the first charge (and the paid plan) starts then.
            'starts_at' => $s->status === 'scheduled' ? $s->starts_at?->toIso8601String() : null,
            'current_period_ends_at' => $s->current_period_ends_at?->toIso8601String(),
            'grace_ends_at' => $s->grace_ends_at?->toIso8601String(),
            'cancel_at_period_end' => $s->cancel_at_period_end,
            'scheduled_plan' => $s->scheduledPlan ? ['code' => $s->scheduledPlan->code, 'name' => $s->scheduledPlan->name] : null,
            'paid' => (bool) $s->provider_subscription_id && in_array($s->status, ['active', 'past_due', 'halted', 'cancelled'], true),
        ];
    }

    private function activate(Subscription $sub, ?CarbonImmutable $start, ?CarbonImmutable $end): void
    {
        DB::transaction(function () use ($sub, $start, $end) {
            $sub->update(['status' => 'active', 'grace_ends_at' => null, 'ended_at' => null]
                + ($start ? ['current_period_starts_at' => $start] : [])
                + ($end ? ['current_period_ends_at' => $end] : []));
            $root = Tenant::findOrFail($sub->tenant_id);
            // Older rows (the trial, an abandoned checkout) are superseded.
            Subscription::withoutGlobalScope(TenantScope::class)->where('tenant_id', $root->id)->where('id', '<', $sub->id)
                ->whereIn('status', ['trialing', 'pending', 'scheduled', 'past_due', 'halted'])->update(['status' => 'expired', 'ended_at' => now()]);
            $this->access->setPlan($root, $sub->plan_id);
            $this->access->restore($root);
            AuditLog::record('billing.active', $root, ['plan_id' => $sub->plan_id, 'until' => $end?->toIso8601String()], $root->id);
        });
    }

    private function charged(Subscription $sub, array $payment, ?CarbonImmutable $start, ?CarbonImmutable $end, ?string $rzpPlanId): void
    {
        // A downgrade scheduled for this period takes effect with its first charge.
        if ($sub->scheduled_plan_id && $rzpPlanId) {
            $scheduled = Plan::find($sub->scheduled_plan_id);
            $ids = collect($scheduled?->razorpay_plans ?? [])->pluck('id');
            if ($ids->contains($rzpPlanId)) {
                $cycle = collect($scheduled->razorpay_plans)->search(fn ($p) => $p['id'] === $rzpPlanId);
                $sub->update(['plan_id' => $scheduled->id, 'scheduled_plan_id' => null, 'billing_cycle' => $cycle ?: $sub->billing_cycle]);
            }
        }
        $this->activate($sub, $start, $end);
        $sub->update(['last_charged_at' => now()]);
        if (! empty($payment['id']) && isset($payment['amount'])) {
            $this->invoices->forCharge($sub->fresh(), (string) $payment['id'], (int) $payment['amount'], $start, $end);
            // The first paid payment of a referred business earns both businesses free days (once).
            if ((int) $payment['amount'] > 0) {
                $this->referrals->paymentReceived(Tenant::findOrFail($sub->tenant_id));
            }
        }
    }

    /** Razorpay ended the subscription (cancelled or all cycles done). */
    private function ended(Subscription $sub): void
    {
        $sub->update(['status' => 'cancelled', 'ended_at' => now(), 'cancel_at_period_end' => false]);
        if ($root = Tenant::find($sub->tenant_id)) {
            $this->referrals->applyPending($root);
        }
    }

    /** The trial end, when a trial (or a checkout started during one) still has more than an hour left. */
    private function trialLeft(?Subscription $current): ?CarbonImmutable
    {
        if (! $current || ! in_array($current->status, ['trialing', 'pending'], true) || ! $current->trial_ends_at) {
            return null;
        }
        $end = CarbonImmutable::parse($current->trial_ends_at);

        return $end->gt(CarbonImmutable::now()->addHour()) ? $end : null;
    }

    /** Authorised in Checkout, first charge later: the business stays on its trial until then. */
    private function authorised(Subscription $sub): void
    {
        if ($sub->status !== 'pending' || ! $sub->starts_at || ! $sub->starts_at->isFuture()) {
            return;
        }
        $sub->update(['status' => 'scheduled', 'checkout_url' => null]);
        AuditLog::record('billing.scheduled', Tenant::find($sub->tenant_id), ['plan_id' => $sub->plan_id, 'starts' => $sub->starts_at->toIso8601String()], $sub->tenant_id);
    }

    /**
     * Cancel a plan that hasn't started: Razorpay drops it now (nothing was charged) and the
     * business is simply on its trial again, free to choose another plan.
     */
    private function cancelScheduled(Tenant $root, Subscription $sub): Subscription
    {
        $this->razorpay->cancel($sub->provider_subscription_id, false);
        $sub->update([
            'status' => 'trialing',
            'plan_id' => $root->plan_id,
            'starts_at' => null,
            'provider' => null,
            'provider_subscription_id' => null,
            'checkout_url' => null,
        ]);
        AuditLog::record('billing.scheduled_cancelled', $root, [], $root->id);
        // Free days waiting because of the scheduled charge can go to the trial now.
        $this->referrals->applyPending($root);

        return $sub->fresh(['plan', 'scheduledPlan']);
    }

    private function lapse(Subscription $sub, string $status): void
    {
        $graceDays = (int) $this->settings->get('billing')['grace_days'];
        $sub->update(['status' => $status, 'grace_ends_at' => $sub->grace_ends_at ?? now()->addDays($graceDays)]);
        AuditLog::record("billing.{$status}", Tenant::find($sub->tenant_id), ['grace_until' => $sub->grace_ends_at?->toIso8601String()], $sub->tenant_id);
    }

    private function plan(string $code): Plan
    {
        $plan = Plan::where('code', $code)->where('is_active', true)->first();
        if (! $plan) {
            throw new ApiException('That plan is not available.', 422, 'invalid_plan', ['field' => 'plan']);
        }

        return $plan;
    }

    /** The Razorpay plan for this plan, cycle and current price (a new price gets a new Razorpay plan). */
    private function razorpayPlan(Plan $plan, string $cycle): string
    {
        $amount = $this->amountPaise($plan, $cycle);
        if (! $amount) {
            throw new ApiException('This plan has no price yet. Please contact support.', 422, 'not_priced', ['field' => 'plan']);
        }
        $known = $plan->razorpay_plans[$cycle] ?? null;
        if ($known && (int) $known['amount'] === $amount) {
            return $known['id'];
        }
        $id = $this->razorpay->createPlan($cycle, $amount, config('app.name')." {$plan->name} ({$cycle})", (string) $plan->description);
        $plan->update(['razorpay_plans' => array_replace($plan->razorpay_plans ?? [], [$cycle => ['id' => $id, 'amount' => $amount]])]);

        return $id;
    }
}
