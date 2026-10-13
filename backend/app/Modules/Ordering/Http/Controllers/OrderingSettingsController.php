<?php

namespace App\Modules\Ordering\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\DeliveryZones;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Dashboard → Ordering settings, payments and delivery zones (business.manage). */
class OrderingSettingsController extends Controller
{
    public function __construct(
        private readonly OrderingSettings $settings,
        private readonly TenantContext $context,
    ) {}

    public function show(): JsonResponse
    {
        return $this->ok($this->payload());
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(OrderingSettings::rules(), [
            'upi.vpa.regex' => 'Enter a UPI ID like yourname@okicici.',
            'upi.vpa.required_if_accepted' => 'Add the UPI ID guests should pay.',
        ]);
        $before = $this->settings->get();
        $saved = $this->settings->save($data);
        AuditLog::record('ordering.settings_updated', $this->context->require(), [
            'accepting_orders' => [$before['accepting_orders'], $saved['accepting_orders']],
            'tax' => [$before['default_tax_rate'], $saved['default_tax_rate']],
        ]);

        return $this->ok($this->payload(), 'Ordering settings saved.');
    }

    public function updateRazorpay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'key_id' => ['nullable', 'string', 'regex:/^rzp_(test|live)_[A-Za-z0-9]{6,30}$/'],
            'key_secret' => ['nullable', 'string', 'min:10', 'max:80'],
            'webhook_secret' => ['nullable', 'string', 'min:6', 'max:120'],
        ], ['key_id.regex' => 'The Key ID starts with rzp_test_ or rzp_live_.']);
        $this->settings->saveRazorpay($data['key_id'] ?? null, $data['key_secret'] ?? null, $data['webhook_secret'] ?? null);
        AuditLog::record('ordering.razorpay_updated', $this->context->require(), ['key_id' => $data['key_id'] ?? null]);

        return $this->ok($this->payload(), ($data['key_id'] ?? null) ? 'Razorpay connected.' : 'Razorpay disconnected.');
    }

    public function storeZone(Request $request): JsonResponse
    {
        $zone = DeliveryZone::create($this->zoneFields($request->validate(DeliveryZones::rules(), $this->zoneMessages())) + ['sort_order' => (int) DeliveryZone::max('sort_order') + 1]);
        AuditLog::record('ordering.zone_created', $zone, ['name' => $zone->name, 'fee' => $zone->fee]);

        return $this->created($this->payload(), 'Delivery zone added.');
    }

    public function updateZone(Request $request, int $id): JsonResponse
    {
        $zone = DeliveryZone::findOrFail($id);
        $zone->update($this->zoneFields($request->validate(DeliveryZones::rules(), $this->zoneMessages())) + ['is_demo' => false]);

        return $this->ok($this->payload(), 'Delivery zone saved.');
    }

    public function destroyZone(int $id): JsonResponse
    {
        DeliveryZone::findOrFail($id)->delete();

        return $this->ok($this->payload(), 'Delivery zone deleted.');
    }

    private function zoneFields(array $d): array
    {
        return [
            'name' => strip_tags($d['name']),
            'type' => $d['type'],
            'pincodes' => $d['type'] === 'pincode' ? array_values(array_unique($d['pincodes'] ?? [])) : null,
            'radius_km' => $d['type'] === 'radius' ? $d['radius_km'] : null,
            'fee' => $d['fee'],
            'min_order' => $d['min_order'],
            'free_above' => $d['free_above'] ?? null,
            'is_active' => $d['is_active'],
        ];
    }

    private function zoneMessages(): array
    {
        return ['pincodes.*.regex' => 'Each pincode must be 6 digits.', 'pincodes.required_if' => 'Add at least one pincode.', 'radius_km.required_if' => 'Enter the delivery radius in km.'];
    }

    private function payload(): array
    {
        $tenant = $this->context->require();

        return [
            'settings' => $this->settings->get(),
            'razorpay' => $this->settings->razorpayPublic() + [
                'webhook_url' => rtrim((string) config('app.url'), '/')."/api/v1/webhooks/razorpay/{$tenant->public_id}",
            ],
            'zones' => DeliveryZone::orderBy('sort_order')->orderBy('id')->get()->map(fn ($z) => [
                'id' => $z->id, 'name' => $z->name, 'type' => $z->type, 'pincodes' => $z->pincodes ?? [], 'radius_km' => $z->radius_km,
                'fee' => $z->fee, 'min_order' => $z->min_order, 'free_above' => $z->free_above, 'is_active' => $z->is_active, 'is_demo' => $z->is_demo,
            ])->values(),
            'site_host' => app(SitePresenter::class)->primaryHost($tenant),
            // Where WhatsApp orders would go: the verified number from Website → contact details.
            'whatsapp_number' => app(\App\Modules\Website\Services\SiteContent::class)->forPublic()['contact']['whatsapp'] ?? null,
        ];
    }
}
