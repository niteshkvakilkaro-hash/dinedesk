<?php

namespace App\Modules\Ordering\Services;

use App\Modules\Settings\Services\TenantSettings;
use Illuminate\Support\Facades\Crypt;

/**
 * How a business takes orders, stored in tenant settings ("ordering").
 * Razorpay credentials live separately ("razorpay") with secrets encrypted.
 */
class OrderingSettings
{
    public const KEY = 'ordering';

    public const RAZORPAY_KEY = 'razorpay';

    public function __construct(private readonly TenantSettings $settings) {}

    public static function defaults(): array
    {
        return [
            // Off until the owner has a menu and switches it on.
            'accepting_orders' => false,
            'types' => ['delivery' => false, 'takeaway' => true, 'dine_in' => false],
            // cod = cash on delivery (delivery orders), counter = pay at the counter (takeaway / dine-in).
            'payments' => ['online' => false, 'cod' => true, 'counter' => true],
            'default_tax_rate' => 5.0,
            'prices_include_tax' => false,
            'packaging_fee' => 0.0,
            'prep_minutes' => 30,
            'delivery_minutes' => 30,
            'scheduling' => ['enabled' => true, 'max_days' => 2],
            'location' => ['lat' => null, 'lng' => null],
            'notifications' => ['email' => true, 'whatsapp' => false, 'sms' => false],
        ];
    }

    public static function rules(): array
    {
        return [
            'accepting_orders' => ['required', 'boolean'],
            'types' => ['required', 'array'],
            'types.delivery' => ['required', 'boolean'],
            'types.takeaway' => ['required', 'boolean'],
            'types.dine_in' => ['required', 'boolean'],
            'payments' => ['required', 'array'],
            'payments.online' => ['required', 'boolean'],
            'payments.cod' => ['required', 'boolean'],
            'payments.counter' => ['required', 'boolean'],
            'default_tax_rate' => ['required', 'numeric', 'in:0,5,12,18,28'],
            'prices_include_tax' => ['required', 'boolean'],
            'packaging_fee' => ['required', 'numeric', 'min:0', 'max:1000'],
            'prep_minutes' => ['required', 'integer', 'min:5', 'max:240'],
            'delivery_minutes' => ['required', 'integer', 'min:5', 'max:240'],
            'scheduling' => ['required', 'array'],
            'scheduling.enabled' => ['required', 'boolean'],
            'scheduling.max_days' => ['required', 'integer', 'min:0', 'max:7'],
            'location' => ['required', 'array'],
            'location.lat' => ['nullable', 'numeric', 'between:-90,90'],
            'location.lng' => ['nullable', 'numeric', 'between:-180,180'],
            'notifications' => ['required', 'array'],
            'notifications.email' => ['required', 'boolean'],
            'notifications.whatsapp' => ['required', 'boolean'],
            'notifications.sms' => ['required', 'boolean'],
        ];
    }

    public function get(): array
    {
        return array_replace_recursive(self::defaults(), (array) $this->settings->get(self::KEY, []));
    }

    public function save(array $data): array
    {
        $clean = array_replace_recursive(self::defaults(), array_intersect_key($data, self::defaults()));
        $clean['default_tax_rate'] = (float) $clean['default_tax_rate'];
        $clean['packaging_fee'] = round((float) $clean['packaging_fee'], 2);
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }

    /** Razorpay account of the business (payments go straight to the restaurant). */
    public function razorpay(): array
    {
        $raw = (array) $this->settings->get(self::RAZORPAY_KEY, []);
        $decrypt = fn ($v) => $v ? rescue(fn () => Crypt::decryptString($v), null, false) : null;

        return [
            'key_id' => $raw['key_id'] ?? null,
            'key_secret' => $decrypt($raw['key_secret'] ?? null),
            'webhook_secret' => $decrypt($raw['webhook_secret'] ?? null),
        ];
    }

    public function razorpayConfigured(): bool
    {
        $r = $this->razorpay();

        return $r['key_id'] && $r['key_secret'];
    }

    /** Secrets are write-only: blank keeps the stored value. */
    public function saveRazorpay(?string $keyId, ?string $keySecret, ?string $webhookSecret): void
    {
        $raw = (array) $this->settings->get(self::RAZORPAY_KEY, []);
        $raw['key_id'] = $keyId ?: null;
        if ($keySecret) {
            $raw['key_secret'] = Crypt::encryptString($keySecret);
        }
        if ($webhookSecret) {
            $raw['webhook_secret'] = Crypt::encryptString($webhookSecret);
        }
        if (! $keyId) {
            $raw = ['key_id' => null, 'key_secret' => null, 'webhook_secret' => null];
        }
        $this->settings->set(self::RAZORPAY_KEY, $raw);
    }

    /** What the dashboard may see: never the secrets themselves. */
    public function razorpayPublic(): array
    {
        $r = $this->razorpay();

        return [
            'key_id' => $r['key_id'],
            'has_key_secret' => (bool) $r['key_secret'],
            'has_webhook_secret' => (bool) $r['webhook_secret'],
            'mode' => $r['key_id'] && str_starts_with($r['key_id'], 'rzp_live_') ? 'live' : ($r['key_id'] ? 'test' : null),
        ];
    }

    /** Payment methods actually usable for an order type right now. */
    public function methodsFor(string $type, ?array $settings = null): array
    {
        $s = $settings ?? $this->get();
        $methods = [];
        if ($s['payments']['online'] && $this->razorpayConfigured()) {
            $methods[] = 'online';
        }
        if ($type === 'delivery' && $s['payments']['cod']) {
            $methods[] = 'cod';
        }
        if ($type !== 'delivery' && $s['payments']['counter']) {
            $methods[] = 'counter';
        }

        return $methods;
    }
}
