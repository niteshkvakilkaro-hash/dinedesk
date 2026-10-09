<?php

namespace App\Modules\Settings\Services;

use App\Modules\Settings\Models\Setting;

/**
 * Key/value settings for the tenant in context. All reads and writes go
 * through the Setting model's tenant scope, so one business can never see
 * another's settings.
 */
class TenantSettings
{
    public const DEFAULTS = [
        'opening_hours' => null, // filled during onboarding
    ];

    public function get(string $key, mixed $default = null): mixed
    {
        $row = Setting::where('key', $key)->first();

        return $row ? $row->value : ($default ?? self::DEFAULTS[$key] ?? null);
    }

    public function set(string $key, mixed $value): void
    {
        Setting::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        return array_merge(self::DEFAULTS, Setting::pluck('value', 'key')->all());
    }
}
