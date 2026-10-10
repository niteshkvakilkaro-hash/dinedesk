<?php

namespace App\Modules\Subscriptions\Services;

use App\Modules\Subscriptions\Models\PlatformSetting;

/**
 * Settings of the platform itself: who sells the subscriptions (for invoices) and how
 * billing behaves. Nothing here is invented: seller details stay empty until the
 * platform owner fills them in, and invoices show only what is set.
 */
class PlatformSettings
{
    public static function defaults(): array
    {
        return [
            'seller' => [
                'legal_name' => null,
                'gstin' => null,
                // Two-digit GST state code (e.g. 08 Rajasthan); taken from the GSTIN when set.
                'state_code' => null,
                'address' => null,
                'email' => null,
                'phone' => null,
                'invoice_prefix' => 'DD',
            ],
            'billing' => [
                // After a failed payment, an ended trial or a cancelled period: days before read-only.
                'grace_days' => 7,
                'gst_rate' => 18,
                // SAC for the subscription (check with your CA).
                'sac' => '998315',
            ],
        ];
    }

    public static function rules(): array
    {
        return [
            'seller.legal_name' => ['nullable', 'string', 'max:150'],
            'seller.gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/'],
            'seller.state_code' => ['nullable', 'regex:/^\d{2}$/'],
            'seller.address' => ['nullable', 'string', 'max:300'],
            'seller.email' => ['nullable', 'email:rfc', 'max:160'],
            'seller.phone' => ['nullable', 'string', 'max:20'],
            'seller.invoice_prefix' => ['required', 'regex:/^[A-Z]{2,6}$/'],
            'billing.grace_days' => ['required', 'integer', 'min:0', 'max:60'],
            'billing.gst_rate' => ['required', 'numeric', 'in:0,18'],
            'billing.sac' => ['required', 'regex:/^\d{6}$/'],
        ];
    }

    public function get(string $section): array
    {
        $stored = (array) (PlatformSetting::where('key', $section)->value('value') ?? []);

        return array_replace(self::defaults()[$section], array_intersect_key($stored, self::defaults()[$section]));
    }

    public function all(): array
    {
        return ['seller' => $this->get('seller'), 'billing' => $this->get('billing')];
    }

    public function save(array $data): array
    {
        foreach (['seller', 'billing'] as $section) {
            if (! isset($data[$section])) {
                continue;
            }
            $clean = array_replace($this->get($section), array_intersect_key($data[$section], self::defaults()[$section]));
            if ($section === 'seller') {
                $clean = array_map(fn ($v) => is_string($v) ? (trim(strip_tags($v)) ?: null) : $v, $clean);
                $clean['gstin'] = $clean['gstin'] ? strtoupper($clean['gstin']) : null;
                $clean['state_code'] = $clean['gstin'] ? substr($clean['gstin'], 0, 2) : $clean['state_code'];
                $clean['invoice_prefix'] ??= 'DD';
            } else {
                $clean['grace_days'] = (int) $clean['grace_days'];
                $clean['gst_rate'] = (float) $clean['gst_rate'];
            }
            PlatformSetting::updateOrCreate(['key' => $section], ['value' => $clean]);
        }

        return $this->all();
    }

    /** GST is charged only once the platform has a GSTIN. */
    public function gstRate(): float
    {
        return $this->get('seller')['gstin'] ? (float) $this->get('billing')['gst_rate'] : 0.0;
    }
}
