<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Subscriptions\Models\PlatformInvoice;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantScope;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

/**
 * Super admin revenue dashboard, from real subscriptions and invoices only (demo businesses
 * and branches are left out). MRR counts paying subscriptions at their plan price before GST;
 * yearly plans count as a twelfth.
 */
class RevenueController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $now = CarbonImmutable::now();
        $tenants = Tenant::whereNull('parent_tenant_id')->where('is_demo', false)->get(['id', 'status', 'created_at']);
        $ids = $tenants->pluck('id');
        $subs = Subscription::withoutGlobalScope(TenantScope::class)->with('plan')->whereIn('tenant_id', $ids)->orderBy('id')->get()->groupBy('tenant_id');
        $current = $subs->map(fn ($rows) => $rows->last());

        $paying = $current->filter(fn ($s) => $s->provider_subscription_id && in_array($s->status, ['active', 'past_due', 'halted'], true) || ($s->status === 'cancelled' && $s->current_period_ends_at?->isFuture()));
        $mrr = fn ($rows) => round($rows->sum(fn ($s) => $s->plan->monthlyValue($s->billing_cycle)), 2);
        $atRisk = $paying->filter(fn ($s) => in_array($s->status, ['past_due', 'halted'], true) || $s->cancel_at_period_end || $s->status === 'cancelled');

        // Trials that ended in the last 90 days, and how many of those businesses ever paid.
        $trialEnded = $subs->filter(fn ($rows) => ($t = $rows->first()->trial_ends_at) && $t->between($now->subDays(90), $now));
        $converted = $trialEnded->filter(fn ($rows) => $rows->contains(fn ($s) => $s->provider_subscription_id && $s->last_charged_at !== null || $s->status === 'active' && $s->provider_subscription_id));
        // Churn: paid subscriptions that ended in the last 30 days, against those paying 30 days ago.
        $ended = $subs->flatten()->filter(fn ($s) => $s->provider_subscription_id && $s->ended_at && $s->ended_at->gte($now->subDays(30)) && in_array($s->status, ['cancelled', 'expired'], true) && $s->last_charged_at);
        $base = $paying->count() + $ended->count();

        $months = collect(range(11, 0))->map(fn ($i) => $now->startOfMonth()->subMonths($i)->format('Y-m'));
        $invoices = PlatformInvoice::withoutTenancy()->whereIn('tenant_id', $ids)->where('issued_at', '>=', $now->startOfMonth()->subMonths(11))->get();
        $collected = $months->map(fn ($m) => [
            'month' => $m,
            'invoices' => $invoices->filter(fn ($i) => $i->issued_at->format('Y-m') === $m)->count(),
            'amount' => round((float) $invoices->filter(fn ($i) => $i->issued_at->format('Y-m') === $m)->sum('taxable_value'), 2),
        ])->values();
        $signups = collect(range(5, 0))->map(fn ($i) => $now->startOfMonth()->subMonths($i))->map(fn ($m) => [
            'month' => $m->format('Y-m'),
            'count' => $tenants->filter(fn ($t) => $t->created_at->format('Y-m') === $m->format('Y-m'))->count(),
        ])->values();

        return $this->ok([
            'mrr' => $mrr($paying),
            'arr' => round($mrr($paying) * 12, 2),
            'mrr_at_risk' => $mrr($atRisk),
            'businesses' => $tenants->count(),
            'paying' => $paying->count(),
            'trialing' => $current->filter(fn ($s) => $s->status === 'trialing' && $s->trial_ends_at?->isFuture())->count(),
            'in_grace' => $current->filter(fn ($s) => $s->grace_ends_at && $s->status !== 'active')->count(),
            'read_only' => $tenants->where('status', 'read_only')->count(),
            'trial_conversion' => $trialEnded->count() ? round($converted->count() / $trialEnded->count() * 100, 1) : null,
            'trials_ended_90d' => $trialEnded->count(),
            'churn_30d' => $base ? round($ended->count() / $base * 100, 1) : null,
            'by_plan' => Plan::orderBy('sort_order')->get()->map(fn (Plan $p) => [
                'code' => $p->code, 'name' => $p->name,
                'paying' => $paying->where('plan_id', $p->id)->count(),
                'mrr' => $mrr($paying->where('plan_id', $p->id)),
                'trialing' => $current->where('plan_id', $p->id)->where('status', 'trialing')->count(),
            ])->values(),
            'collected' => $collected,
            'signups' => $signups,
            'unpriced_plans' => Plan::where('is_active', true)->whereNull('price_monthly')->pluck('name'),
        ]);
    }
}
