<?php

namespace App\Modules\Subscriptions\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Plans\Support\Features;
use App\Modules\Subscriptions\Models\PlatformInvoice;
use App\Modules\Subscriptions\Services\PlatformInvoices;
use App\Modules\Subscriptions\Services\PlatformRazorpay;
use App\Modules\Subscriptions\Services\PlatformSettings;
use App\Modules\Subscriptions\Services\SubscriptionManager;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Dashboard → Billing (owner): plan, trial / renewal, plans to choose from, invoices.
 * Works while the business is read-only, so an owner can always pay. Branches are
 * billed through their main business.
 */
class SubscriptionController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly SubscriptionManager $subscriptions,
        private readonly PlatformInvoices $invoices,
    ) {}

    public function show(PlatformRazorpay $razorpay, PlatformSettings $settings, FeatureService $features): JsonResponse
    {
        $tenant = $this->context->require();
        $root = $tenant->billingRoot();
        $limits = $features->limits($tenant);

        return $this->ok([
            'business_status' => $tenant->status,
            'is_branch' => $root->id !== $tenant->id,
            'main_business' => $root->id !== $tenant->id ? $root->name : null,
            'subscription' => $this->subscriptions->present($this->subscriptions->current($root)),
            'payments_ready' => $razorpay->configured(),
            'gst_rate' => $settings->gstRate(),
            'grace_days' => $settings->get('billing')['grace_days'],
            'plans' => Plan::where('is_active', true)->orderBy('sort_order')->get()->map(fn (Plan $p) => [
                'code' => $p->code,
                'name' => $p->name,
                'description' => $p->description,
                'price_monthly' => $p->price_monthly,
                'price_yearly' => $p->price_yearly,
                'charge_monthly' => ($a = $this->subscriptions->amountPaise($p, 'monthly')) ? number_format($a / 100, 2, '.', '') : null,
                'charge_yearly' => ($a = $this->subscriptions->amountPaise($p, 'yearly')) ? number_format($a / 100, 2, '.', '') : null,
                'features' => $p->features,
                'limits' => $p->limits,
            ])->values(),
            'catalogue' => array_keys(Features::CATALOGUE),
            // What the business uses now, so a downgrade can warn about limits.
            'usage' => $this->context->run($root, fn () => [
                'menu_items' => MenuItem::count(),
                'staff_accounts' => max(0, User::where('tenant_id', $root->id)->count() - 1),
                'branches' => 1 + Tenant::where('parent_tenant_id', $root->id)->count(),
            ]),
            'limits' => $limits,
            'invoices' => PlatformInvoice::withoutTenancy()->where('tenant_id', $root->id)->orderByDesc('id')->limit(36)->get()->map(fn ($i) => $this->invoices->present($i))->values(),
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $data = $request->validate(['plan' => ['required', 'string', 'max:30'], 'cycle' => ['required', Rule::in(['monthly', 'yearly'])]]);

        return $this->ok($this->subscriptions->checkout($this->root(), $data['plan'], $data['cycle'], $request->user()));
    }

    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'razorpay_payment_id' => ['required', 'string', 'max:64'],
            'razorpay_subscription_id' => ['required', 'string', 'max:64'],
            'razorpay_signature' => ['required', 'string', 'max:128'],
        ]);
        $sub = $this->subscriptions->verify($this->root(), $data['razorpay_payment_id'], $data['razorpay_subscription_id'], $data['razorpay_signature']);

        return $this->ok($this->subscriptions->present($sub), $sub->status === 'scheduled'
            ? 'Thank you! Your plan starts when your trial ends; you won’t be charged until then.'
            : 'Thank you! Your subscription is active.');
    }

    public function change(Request $request): JsonResponse
    {
        $data = $request->validate(['plan' => ['required', 'string', 'max:30'], 'cycle' => ['required', Rule::in(['monthly', 'yearly'])]]);
        $sub = $this->subscriptions->changePlan($this->root(), $data['plan'], $data['cycle']);

        return $this->ok($this->subscriptions->present($sub), $sub->scheduled_plan_id ? 'Your plan changes at the end of this billing period.' : 'Upgraded. The new features are on now.');
    }

    public function cancel(): JsonResponse
    {
        $sub = $this->subscriptions->cancel($this->root());

        return $this->ok($this->subscriptions->present($sub), $sub->status === 'trialing' ? 'Cancelled. You are on your free trial until it ends.' : 'Your subscription will end with this billing period.');
    }

    public function invoice(string $id): Response
    {
        $root = $this->context->require()->billingRoot();
        $invoice = PlatformInvoice::withoutTenancy()->where('tenant_id', $root->id)->where('public_id', $id)->firstOrFail();

        return $this->invoices->pdf($invoice)->download(str_replace('/', '-', $invoice->number).'.pdf');
    }

    /** Only the main business pays; a branch's owner manages billing from there. */
    private function root(): Tenant
    {
        $tenant = $this->context->require();
        if ($tenant->parent_tenant_id) {
            throw new ApiException('Billing is managed from your main business. Switch to it to change the plan.', 422, 'branch_billing');
        }

        return $tenant;
    }
}
