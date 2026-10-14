<?php

namespace App\Modules\Marketing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Marketing\Models\AutomationSend;
use App\Modules\Marketing\Models\Banner;
use App\Modules\Marketing\Models\Campaign;
use App\Modules\Marketing\Models\Coupon;
use App\Modules\Marketing\Models\CouponRedemption;
use App\Modules\Marketing\Services\Automations;
use App\Modules\Marketing\Services\Campaigns;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Marketing: coupons, banners / popups, campaigns. */
class MarketingController extends Controller
{
    public function __construct(private readonly TenantContext $context) {}

    // ---------- Coupons ----------

    public function coupons(): JsonResponse
    {
        $savings = CouponRedemption::whereNull('reversed_at')->selectRaw('coupon_id, SUM(amount) as total')->groupBy('coupon_id')->pluck('total', 'coupon_id');

        return $this->ok(Coupon::orderByDesc('id')->get()->map(fn (Coupon $c) => $this->coupon($c) + ['discount_given' => number_format((float) ($savings[$c->id] ?? 0), 2, '.', '')])->values());
    }

    public function storeCoupon(Request $request): JsonResponse
    {
        $coupon = Coupon::create($this->couponData($request));
        AuditLog::record('coupon.created', $coupon, ['code' => $coupon->code]);

        return $this->created($this->coupon($coupon), 'Coupon created.');
    }

    public function updateCoupon(Request $request, int $id): JsonResponse
    {
        $coupon = Coupon::findOrFail($id);
        $coupon->update($this->couponData($request, $coupon->id));

        return $this->ok($this->coupon($coupon), 'Saved.');
    }

    public function destroyCoupon(int $id): JsonResponse
    {
        $coupon = Coupon::findOrFail($id);
        // Used coupons are kept for the records; they are switched off instead.
        $coupon->used_count > 0 ? $coupon->update(['is_active' => false]) : $coupon->delete();

        return $this->ok(null, $coupon->used_count > 0 ? 'Coupon switched off (it has been used, so it is kept).' : 'Coupon deleted.');
    }

    private function couponData(Request $request, ?int $ignore = null): array
    {
        $request->merge(['code' => strtoupper(preg_replace('/\s+/', '', (string) $request->input('code')))]);
        $data = $request->validate([
            'code' => ['required', 'string', 'min:3', 'max:30', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('coupons', 'code')->where('tenant_id', $this->context->id())->ignore($ignore)],
            'description' => ['nullable', 'string', 'max:200'],
            'type' => ['required', Rule::in(['flat', 'percent'])],
            'value' => ['required', 'numeric', 'min:1', $request->input('type') === 'percent' ? 'max:100' : 'max:100000'],
            'max_discount' => ['nullable', 'numeric', 'min:1'],
            'min_order' => ['nullable', 'numeric', 'min:0'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'per_customer_limit' => ['nullable', 'integer', 'min:1'],
            'online' => ['boolean'],
            'pos' => ['boolean'],
            'is_public' => ['boolean'],
            'is_active' => ['boolean'],
        ], ['code.regex' => 'Use letters, numbers, - and _ only.', 'code.unique' => 'Another coupon already uses this code.']);
        $data['min_order'] ??= 0;
        $data['description'] = isset($data['description']) ? strip_tags($data['description']) : null;

        return $data;
    }

    private function coupon(Coupon $c): array
    {
        return [
            'id' => $c->id, 'code' => $c->code, 'description' => $c->description, 'type' => $c->type, 'value' => $c->value,
            'max_discount' => $c->max_discount, 'min_order' => $c->min_order,
            'starts_at' => $c->starts_at?->toIso8601String(), 'ends_at' => $c->ends_at?->toIso8601String(),
            'usage_limit' => $c->usage_limit, 'per_customer_limit' => $c->per_customer_limit, 'used_count' => $c->used_count,
            'online' => $c->online, 'pos' => $c->pos, 'is_public' => $c->is_public, 'is_active' => $c->is_active,
        ];
    }

    // ---------- Banners ----------

    public function banners(): JsonResponse
    {
        return $this->ok(Banner::orderBy('sort_order')->orderByDesc('id')->get()->map(fn (Banner $b) => $this->banner($b))->values());
    }

    public function storeBanner(Request $request): JsonResponse
    {
        return $this->created($this->banner(Banner::create($this->bannerData($request))), 'Banner created.');
    }

    public function updateBanner(Request $request, int $id): JsonResponse
    {
        $b = Banner::findOrFail($id);
        $b->update($this->bannerData($request));

        return $this->ok($this->banner($b), 'Saved.');
    }

    public function destroyBanner(int $id): JsonResponse
    {
        Banner::findOrFail($id)->delete();

        return $this->ok(null, 'Banner deleted.');
    }

    private function bannerData(Request $request): array
    {
        $data = $request->validate([
            'placement' => ['required', Rule::in(['bar', 'popup', 'offer'])],
            'title' => ['required', 'string', 'max:120'],
            'title_hi' => ['nullable', 'string', 'max:120'],
            'text' => ['nullable', 'string', 'max:300'],
            'text_hi' => ['nullable', 'string', 'max:300'],
            'cta_label' => ['nullable', 'string', 'max:40'],
            'cta_link' => ['nullable', Rule::in(['/menu', '/reserve', '/offers', '/contact'])],
            'coupon_code' => ['nullable', 'string', 'max:30'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
        foreach (['title', 'title_hi', 'text', 'text_hi', 'cta_label'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = strip_tags($data[$k]);
            }
        }
        $data['coupon_code'] = ! empty($data['coupon_code']) ? strtoupper($data['coupon_code']) : null;

        return $data;
    }

    private function banner(Banner $b): array
    {
        $live = $b->is_active && (! $b->starts_at || $b->starts_at->isPast()) && (! $b->ends_at || $b->ends_at->isFuture());

        return $b->only(['id', 'placement', 'title', 'title_hi', 'text', 'text_hi', 'cta_label', 'cta_link', 'coupon_code', 'is_active', 'sort_order']) + [
            'starts_at' => $b->starts_at?->toIso8601String(), 'ends_at' => $b->ends_at?->toIso8601String(), 'live' => $live,
        ];
    }

    // ---------- Campaigns ----------

    /** Automatic messages: settings, who would get each today, and how many went out in 30 days. */
    public function automations(Automations $automations): JsonResponse
    {
        return $this->ok($this->automationsPayload($automations));
    }

    public function updateAutomations(Request $request, Automations $automations): JsonResponse
    {
        $automations->save($request->validate(Automations::rules()));
        AuditLog::record('automations.updated', null, ['enabled' => collect(Automations::KINDS)->filter(fn ($k) => $request->boolean("{$k}.enabled"))->values()->all()]);

        return $this->ok($this->automationsPayload($automations), 'Saved.');
    }

    private function automationsPayload(Automations $automations): array
    {
        return [
            'settings' => $automations->get(),
            'due_today' => $automations->due($this->context->require()),
            'sent_30_days' => AutomationSend::where('sent_on', '>=', now()->subDays(30)->format('Y-m-d'))->get()->countBy('kind'),
        ];
    }

    public function campaigns(): JsonResponse
    {
        return $this->ok(Campaign::orderByDesc('id')->limit(50)->get()->map(fn (Campaign $c) => $c->only(['id', 'name', 'channel', 'message', 'audience', 'recipients', 'status']) + ['sent_at' => $c->sent_at?->toIso8601String()])->values());
    }

    public function audience(Request $request, Campaigns $campaigns): JsonResponse
    {
        $data = $request->validate($this->campaignRules(false));

        return $this->ok(['recipients' => $campaigns->audience($data['audience'] ?? [], $data['channel'])->count()]);
    }

    public function send(Request $request, Campaigns $campaigns): JsonResponse
    {
        $data = $request->validate($this->campaignRules(true));
        $c = $campaigns->send($this->context->require(), $data, $request->user());

        return $this->created(['id' => $c->id, 'recipients' => $c->recipients], "Sent to {$c->recipients} customers.");
    }

    private function campaignRules(bool $full): array
    {
        return [
            'channel' => ['required', Rule::in(Campaigns::CHANNELS)],
            'audience' => ['nullable', 'array'],
            'audience.tags' => ['nullable', 'array', 'max:10'],
            'audience.tags.*' => ['string', 'max:30'],
            'audience.min_visits' => ['nullable', 'integer', 'min:0'],
            'audience.inactive_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'audience.birthday_month' => ['nullable', 'integer', 'min:1', 'max:12'],
        ] + ($full ? [
            'name' => ['required', 'string', 'max:120'],
            'message' => ['required', 'string', 'min:5', 'max:600'],
        ] : []);
    }
}
