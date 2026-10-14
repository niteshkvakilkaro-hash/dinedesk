<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Support\Roles;
use App\Modules\Plans\Models\FeatureOverride;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Plans\Support\Features;
use App\Modules\Referrals\Models\ReferralReward;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Super admin: every business on the platform. This is the only place that
 * reads across tenants, and it does so explicitly (no tenant in context).
 */
class TenantController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(Tenant::STATUSES)],
            'plan' => ['nullable', 'string', 'max:30'],
            'type' => ['nullable', Rule::in(Tenant::TYPES)],
            'sort' => ['nullable', Rule::in(['newest', 'oldest', 'name', 'last_active'])],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Tenant::query()
            ->with(['plan', 'currentSubscription.plan'])
            ->withCount('users')
            ->addSelect(['owner_email' => $this->ownerColumn('email'), 'owner_name' => $this->ownerColumn('name'), 'owner_phone' => $this->ownerColumn('phone')])
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($data['type'] ?? null, fn ($q, $t) => $q->where('business_type', $t))
            ->when($data['plan'] ?? null, fn ($q, $p) => $q->whereHas('plan', fn ($w) => $w->where('code', $p)))
            ->when(trim($data['search'] ?? ''), function (Builder $q, string $s) {
                $like = '%'.addcslashes($s, '%_\\').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('slug', 'like', $like)->orWhere('city', 'like', $like)
                    ->orWhereIn('id', User::select('tenant_id')->whereNotNull('tenant_id')->where(fn ($u) => $u->where('email', 'like', $like)->orWhere('phone', 'like', $like))));
            });

        match ($data['sort'] ?? 'newest') {
            'oldest' => $query->orderBy('created_at'),
            'name' => $query->orderBy('name'),
            'last_active' => $query->orderByRaw('last_active_at IS NULL, last_active_at DESC'),
            default => $query->orderByDesc('created_at')->orderByDesc('id'),
        };

        $page = $query->paginate($data['per_page'] ?? 25);

        $rows = $page->getCollection()->map(fn (Tenant $t) => $this->row($t));

        return $this->ok($rows, null, [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
            'summary' => $this->summary(),
        ]);
    }

    public function show(string $publicId, FeatureService $features): JsonResponse
    {
        $tenant = $this->find($publicId);
        $tenant->load(['plan', 'domains', 'subscriptions.plan', 'featureOverrides']);
        $owner = $this->owner($tenant);

        return $this->ok($this->row($tenant) + [
            'gstin' => $tenant->gstin,
            'timezone' => $tenant->timezone,
            'onboarding_step' => $tenant->onboarding_step,
            'owner' => $owner ? ['name' => $owner->name, 'email' => $owner->email, 'phone' => $owner->phone] : null,
            'domains' => $tenant->domains->map(fn ($d) => ['domain' => $d->domain, 'type' => $d->type, 'is_primary' => $d->is_primary, 'verified' => (bool) $d->verified_at]),
            'subscriptions' => $tenant->subscriptions->map(fn ($s) => [
                'plan' => $s->plan->code, 'status' => $s->status, 'billing_cycle' => $s->billing_cycle,
                'trial_ends_at' => $s->trial_ends_at?->toIso8601String(), 'created_at' => $s->created_at?->toIso8601String(),
            ]),
            'features' => $features->features($tenant),
            'limits' => $features->limits($tenant),
            'overrides' => $tenant->featureOverrides->map(fn ($o) => [
                'feature' => $o->feature, 'enabled' => $o->enabled, 'reason' => $o->reason, 'expires_at' => $o->expires_at?->toIso8601String(),
            ]),
            'referrals' => app(ReferralRewards::class)->forPlatform($tenant),
            'recent_activity' => AuditLog::where('tenant_id', $tenant->id)->latest('id')->limit(15)->with('user:id,name')->get()->map(fn ($a) => [
                'action' => $a->action, 'by' => $a->user?->name, 'meta' => $a->meta, 'at' => $a->created_at?->toIso8601String(),
            ]),
        ]);
    }

    /** Change status and/or plan. A reason is required and audited. */
    public function update(Request $request, string $publicId, FeatureService $features): JsonResponse
    {
        $tenant = $this->find($publicId);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(Tenant::STATUSES)],
            'plan' => ['sometimes', 'string', Rule::exists('plans', 'code')],
            'reason' => ['required', 'string', 'min:5', 'max:255'],
        ]);

        $before = ['status' => $tenant->status, 'plan' => $tenant->plan->code];

        DB::transaction(function () use ($tenant, $data, $before) {
            if (isset($data['status'])) {
                $tenant->update(['status' => $data['status']]);
                if ($data['status'] === 'suspended') {
                    // Sign everyone in the business out.
                    DB::table('personal_access_tokens')->where('tokenable_type', User::class)
                        ->whereIn('tokenable_id', User::where('tenant_id', $tenant->id)->select('id'))->delete();
                }
            }
            if (isset($data['plan'])) {
                $plan = Plan::where('code', $data['plan'])->firstOrFail();
                // A business and its branches always share one plan.
                $root = $tenant->billingRoot();
                app(\App\Modules\Subscriptions\Services\TenantAccess::class)->setPlan($root, $plan->id);
                $root->currentSubscription?->update(['plan_id' => $plan->id]);
            }
            AuditLog::record('platform.tenant.updated', $tenant, ['reason' => $data['reason'], 'before' => $before, 'after' => array_diff_key($data, ['reason' => 1])], $tenant->id);
        });

        $features->forget($tenant);

        return $this->show($publicId, $features);
    }

    public function storeOverride(Request $request, string $publicId, FeatureService $features): JsonResponse
    {
        $tenant = $this->find($publicId);
        $data = $request->validate([
            'feature' => ['required', Rule::in(Features::keys())],
            'enabled' => ['required', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:255'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        FeatureOverride::withoutTenancy()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'feature' => $data['feature']],
            ['enabled' => $data['enabled'], 'reason' => $data['reason'], 'expires_at' => $data['expires_at'] ?? null, 'created_by' => $request->user()->id],
        );
        AuditLog::record('platform.feature_override.set', $tenant, $data, $tenant->id);
        $features->forget($tenant);

        return $this->show($publicId, $features);
    }

    public function destroyOverride(Request $request, string $publicId, string $feature, FeatureService $features): JsonResponse
    {
        $tenant = $this->find($publicId);
        FeatureOverride::withoutTenancy()->where('tenant_id', $tenant->id)->where('feature', $feature)->delete();
        AuditLog::record('platform.feature_override.removed', $tenant, ['feature' => $feature], $tenant->id);
        $features->forget($tenant);

        return $this->show($publicId, $features);
    }

    private function find(string $publicId): Tenant
    {
        return Tenant::where('public_id', $publicId)->firstOrFail();
    }

    private function row(Tenant $t): array
    {
        $subscription = $t->currentSubscription;

        return [
            'id' => $t->public_id,
            'name' => $t->name,
            'slug' => $t->slug,
            'site_host' => TenantResolver::subdomainFor($t->slug),
            'business_type' => $t->business_type,
            'city' => $t->city,
            'status' => $t->status,
            'is_demo' => $t->is_demo,
            'plan' => ['code' => $t->plan->code, 'name' => $t->plan->name],
            'subscription_status' => $subscription?->status,
            'trial_ends_at' => $subscription?->trial_ends_at?->toIso8601String(),
            'grace_ends_at' => $subscription?->grace_ends_at?->toIso8601String(),
            'current_period_ends_at' => $subscription?->current_period_ends_at?->toIso8601String(),
            'branch_of' => $t->parent_tenant_id ? Tenant::whereKey($t->parent_tenant_id)->value('name') : null,
            'mrr' => $this->mrr($t),
            'owner_name' => $t->owner_name ?? null,
            'owner_contact' => $t->owner_email ?? $t->owner_phone ?? null,
            'users_count' => $t->users_count ?? null,
            'created_at' => $t->created_at?->toIso8601String(),
            'last_active_at' => $t->last_active_at?->toIso8601String(),
        ];
    }

    /** Monthly recurring revenue from a tenant: paying subscriptions only (trials count as 0). */
    private function mrr(Tenant $t): float
    {
        $s = $t->currentSubscription;
        if (! $s || ! in_array($s->status, ['active', 'past_due', 'halted'], true) || ! $s->provider_subscription_id) {
            return 0.0;
        }

        return $s->plan->monthlyValue($s->billing_cycle);
    }

    private function summary(): array
    {
        $byStatus = Tenant::select('status', DB::raw('COUNT(*) as n'))->groupBy('status')->pluck('n', 'status');
        $mrr = Tenant::with('currentSubscription.plan')->get()->sum(fn (Tenant $t) => $this->mrr($t));

        return [
            'total' => (int) $byStatus->sum(),
            'by_status' => $byStatus,
            'trialing' => DB::table('subscriptions as s')
                ->whereRaw('s.id = (select max(id) from subscriptions where tenant_id = s.tenant_id)')
                ->where('s.status', 'trialing')->count(),
            'mrr' => round($mrr, 2),
            // Referral free days that wait for a business whose plan renews automatically.
            'referral_credits_pending' => ReferralReward::where('status', 'pending')->count(),
        ];
    }

    /** Subquery column for the owner's details (roles are team-scoped, so join explicitly). */
    private function ownerColumn(string $column)
    {
        $team = config('permission.column_names.team_foreign_key');

        return User::query()->select("users.{$column}")
            ->join('model_has_roles as mhr', function ($j) use ($team) {
                $j->on('mhr.model_id', '=', 'users.id')->where('mhr.model_type', User::class)->whereColumn("mhr.{$team}", 'users.tenant_id');
            })
            ->join('roles', 'roles.id', '=', 'mhr.role_id')
            ->where('roles.name', Roles::OWNER)
            ->whereColumn('users.tenant_id', 'tenants.id')
            ->limit(1);
    }

    private function owner(Tenant $tenant): ?User
    {
        $team = config('permission.column_names.team_foreign_key');

        return User::query()->select('users.*')
            ->join('model_has_roles as mhr', fn ($j) => $j->on('mhr.model_id', '=', 'users.id')->where('mhr.model_type', User::class)->where("mhr.{$team}", $tenant->id))
            ->join('roles', 'roles.id', '=', 'mhr.role_id')
            ->where('roles.name', Roles::OWNER)
            ->where('users.tenant_id', $tenant->id)
            ->first();
    }
}
