<?php

namespace App\Modules\Referrals\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Referrals\Models\ReferralReward;
use App\Modules\Referrals\Notifications\ReferralRewardEarned;
use App\Modules\Reports\Services\DailySummary;
use App\Modules\Subscriptions\Services\TenantAccess;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantScope;
use App\Support\LocalDate;
use App\Support\Locale;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Refer a business. A new business that signed up with another's code remembers it; its
 * first paid subscription payment earns both businesses free days (config
 * dinedesk.referrals.reward_days), once.
 *
 * Free days are only added where nothing else will charge the business for those days:
 *  - on a trial (or a lapsed trial, or a checkout not paid yet): the trial end moves;
 *  - on a paid plan that will not renew (cancelled): the end of the paid period moves.
 * A plan that renews automatically on Razorpay would still be charged on its renewal date,
 * so there the reward stays pending: it is added on its own as soon as the business is in
 * one of the states above, or the super admin applies it by hand (e.g. as a refund or a
 * Razorpay offer) and marks it applied. Nothing is ever shown as added before it is.
 * The same goes for a plan paid for during the trial (scheduled to start when the trial
 * ends): its first charge is fixed on Razorpay, so moving the trial end would not move it.
 * Cancelling that plan (back to the plain trial) adds the waiting days to the trial.
 */
class ReferralRewards
{
    public function __construct(
        private readonly ReferralCodes $codes,
        private readonly TenantAccess $access,
    ) {}

    public static function days(): int
    {
        return max(0, (int) config('dinedesk.referrals.reward_days'));
    }

    /**
     * At business creation: remember who referred it. Invalid, demo, branch and own codes
     * are ignored without a word (the sign-up must never fail because of a code). One referral
     * per business: it is set here, at creation, and never changed.
     */
    public function recordSignup(Tenant $new, User $owner, ?string $code): void
    {
        $referrer = $this->codes->referrer($code);
        if (! $referrer || $referrer->id === $new->id || $new->is_demo || $new->parent_tenant_id || $owner->tenant_id === $referrer->id) {
            return;
        }
        $new->update(['referred_by_tenant_id' => $referrer->id]);
        AuditLog::record('referral.signed_up', $new, ['referred_by' => $referrer->name], $new->id);
        AuditLog::record('referral.new_signup', $new, ['business' => $new->name], $referrer->id);
    }

    /**
     * A subscription payment came in (Razorpay subscription.charged). The first one of a
     * referred business earns the rewards; webhook repeats and later renewals do nothing.
     */
    public function paymentReceived(Tenant $root): void
    {
        if (! $root->referred_by_tenant_id || $root->referral_rewarded_at || $root->is_demo || self::days() === 0) {
            return;
        }
        $days = self::days();
        $granted = DB::transaction(function () use ($root, $days) {
            // Row lock: two webhook deliveries at the same moment grant once.
            $referred = Tenant::whereKey($root->id)->lockForUpdate()->first();
            if (! $referred || $referred->referral_rewarded_at || ! $referred->referred_by_tenant_id) {
                return null;
            }
            $referred->update(['referral_rewarded_at' => now()]);
            $referrer = Tenant::whereKey($referred->referred_by_tenant_id)->where('is_demo', false)->first();

            $rows = ['referred' => $this->grant($referred, $referred, 'referred', $days)];
            if ($referrer) {
                $rows['referrer'] = $this->grant($referrer, $referred, 'referrer', $days);
            }

            return [$referred, $referrer, $rows];
        });
        if (! $granted) {
            return;
        }
        [$referred, $referrer, $rows] = $granted;
        $this->applyPending($referred);
        if ($referrer) {
            $this->applyPending($referrer);
            $this->notifyReferrer($referrer, $referred, $rows['referrer']->fresh());
        }
    }

    /**
     * Adds a business's pending free days where that is safe (see the class comment).
     * Returns the days added (0 when they have to wait).
     */
    public function applyPending(Tenant $root): int
    {
        $result = DB::transaction(function () use ($root) {
            $pending = ReferralReward::where('tenant_id', $root->id)->where('status', 'pending')->orderBy('id')->lockForUpdate()->get();
            $sub = Subscription::withoutGlobalScope(TenantScope::class)->where('tenant_id', $root->id)->orderByDesc('id')->lockForUpdate()->first();
            $target = $sub ? $this->target($sub) : null;
            if ($pending->isEmpty() || ! $target) {
                return null;
            }
            $days = (int) $pending->sum('days');
            $now = CarbonImmutable::now();
            $column = $target === 'trial' ? 'trial_ends_at' : 'current_period_ends_at';
            $from = $sub->{$column} && $sub->{$column}->gt($now) ? CarbonImmutable::parse($sub->{$column}) : $now;
            $end = $from->addDays($days);

            $sub->update([$column => $end, 'grace_ends_at' => null]
                // A trial that had lapsed into its grace period is a trial again.
                + ($sub->status === 'past_due' ? ['status' => 'trialing'] : []));
            ReferralReward::whereIn('id', $pending->pluck('id'))->update(['status' => 'applied', 'applied_to' => $target, 'applied_at' => $now, 'new_end' => $end]);
            AuditLog::record('referral.reward_applied', $sub, ['days' => $days, 'to' => $target, 'until' => $end->toIso8601String()], $root->id);

            return $days;
        });
        if ($result && ($fresh = $root->fresh()) && $fresh->status === 'read_only') {
            $this->access->restore($fresh);
        }

        return (int) $result;
    }

    /** Hourly (subscriptions:enforce): businesses whose credit can be added by now get it. */
    public function applyAllPending(): int
    {
        $n = 0;
        foreach (ReferralReward::where('status', 'pending')->distinct()->pluck('tenant_id') as $id) {
            $tenant = Tenant::find($id);
            if ($tenant && $this->applyPending($tenant) > 0) {
                $n++;
            }
        }

        return $n;
    }

    /** Super admin: the credit was given another way (refund, Razorpay offer ...). */
    public function markApplied(ReferralReward $reward, User $by, string $note): ReferralReward
    {
        DB::transaction(function () use ($reward, $by, $note) {
            $row = ReferralReward::whereKey($reward->id)->lockForUpdate()->firstOrFail();
            if ($row->status !== 'pending') {
                return;
            }
            $row->update(['status' => 'applied', 'applied_to' => 'manual', 'applied_at' => now(), 'note' => $note, 'applied_by' => $by->id]);
            AuditLog::record('platform.referral_reward.applied', $row, ['days' => $row->days, 'reason' => $note], $row->tenant_id);
        });

        return $reward->fresh();
    }

    /** Dashboard → Billing → Refer a business. Other businesses: name and progress only. */
    public function forOwner(Tenant $tenant): array
    {
        $root = $tenant->billingRoot();
        $code = $this->codes->codeFor($root);
        $referred = Tenant::where('referred_by_tenant_id', $root->id)->orderByDesc('id')->get(['id', 'name', 'referral_rewarded_at', 'created_at']);
        $rewards = ReferralReward::where('tenant_id', $root->id)->with('referred:id,name')->orderByDesc('id')->get();

        return [
            'available' => $code !== null,
            'code' => $code,
            'reward_days' => self::days(),
            'stats' => [
                'signed_up' => $referred->count(),
                'paying' => $referred->whereNotNull('referral_rewarded_at')->count(),
                'days_earned' => (int) $rewards->sum('days'),
                'days_pending' => (int) $rewards->where('status', 'pending')->sum('days'),
            ],
            'businesses' => $referred->take(50)->map(fn (Tenant $t) => [
                'name' => $t->name,
                'status' => $t->referral_rewarded_at ? 'paying' : 'signed_up',
                'joined_at' => $t->created_at?->toIso8601String(),
            ])->values(),
            'rewards' => $rewards->map(fn (ReferralReward $r) => $this->presentReward($r, false))->values(),
            'referred_by' => $root->referred_by_tenant_id ? $root->referredBy?->name : null,
        ];
    }

    /** Super admin → business detail. */
    public function forPlatform(Tenant $tenant): array
    {
        $root = $tenant->billingRoot();
        $referredBy = $root->referred_by_tenant_id ? $root->referredBy : null;

        return [
            'code' => $root->is_demo ? null : $root->referral_code,
            'referred_by' => $referredBy ? ['id' => $referredBy->public_id, 'name' => $referredBy->name] : null,
            'rewarded_at' => $root->referral_rewarded_at?->toIso8601String(),
            'referred' => Tenant::withTrashed()->where('referred_by_tenant_id', $root->id)->orderByDesc('id')->limit(100)->get()->map(fn (Tenant $t) => [
                'id' => $t->public_id, 'name' => $t->name, 'status' => $t->status, 'deleted' => $t->trashed(),
                'paying' => (bool) $t->referral_rewarded_at, 'created_at' => $t->created_at?->toIso8601String(),
            ])->values(),
            'rewards' => ReferralReward::where('tenant_id', $root->id)->with('referred:id,name')->orderByDesc('id')->get()
                ->map(fn (ReferralReward $r) => $this->presentReward($r, true))->values(),
        ];
    }

    private function presentReward(ReferralReward $r, bool $admin): array
    {
        return [
            'role' => $r->role,
            'days' => $r->days,
            'status' => $r->status,
            'applied_to' => $r->applied_to,
            'applied_at' => $r->applied_at?->toIso8601String(),
            'new_end' => $r->new_end?->toIso8601String(),
            'business' => $r->referred?->name,
            'created_at' => $r->created_at?->toIso8601String(),
        ] + ($admin ? ['id' => $r->id, 'note' => $r->note] : []);
    }

    private function grant(Tenant $to, Tenant $referred, string $role, int $days): ReferralReward
    {
        $row = ReferralReward::firstOrCreate(['tenant_id' => $to->id, 'referred_tenant_id' => $referred->id], ['role' => $role, 'days' => $days, 'status' => 'pending']);
        AuditLog::record('referral.reward_granted', $row, ['role' => $role, 'days' => $days, 'business' => $referred->name], $to->id);

        return $row;
    }

    /** 'trial' / 'period' when free days can be added without Razorpay charging for them; null to wait. */
    private function target(Subscription $s): ?string
    {
        return match (true) {
            // Paying during the trial: Razorpay charges on the start date fixed at checkout
            // (the trial end then). Moving the trial end would not move that charge, so wait.
            $s->status === 'scheduled', $s->status === 'pending' && $s->starts_at?->isFuture() => null,
            in_array($s->status, ['trialing', 'pending'], true) => 'trial',
            $s->status === 'past_due' && ! $s->provider_subscription_id => 'trial',
            $s->status === 'cancelled', $s->status === 'active' && $s->cancel_at_period_end => 'period',
            default => null,
        };
    }

    private function notifyReferrer(Tenant $referrer, Tenant $referred, ReferralReward $reward): void
    {
        $owner = app(DailySummary::class)->owner($referrer);
        if (! $owner) {
            return;
        }
        $locale = Locale::guest($owner->locale);
        $t = fn (string $key, array $replace = []) => trans("owner.referral.{$key}", $replace, $locale);
        $date = $reward->new_end ? LocalDate::format($reward->new_end, 'D MMM YYYY', $locale, $referrer->timezone) : '';
        $url = rtrim((string) config('dinedesk.dashboard_url'), '/').'/dashboard/billing';
        $lines = [
            $t('paid', ['business' => $referred->name]),
            match ($reward->status === 'applied' ? $reward->applied_to : null) {
                'trial' => $t('applied_trial', ['days' => $reward->days, 'date' => $date]),
                'period' => $t('applied_period', ['days' => $reward->days, 'date' => $date]),
                default => $t('pending', ['days' => $reward->days]),
            },
            $t('thanks'),
        ];
        $owner->notify(new ReferralRewardEarned($t('subject', ['business' => $referred->name, 'days' => $reward->days]), $lines, $url, $t('link', ['url' => $url])));
    }
}
