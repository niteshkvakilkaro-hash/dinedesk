<?php

namespace App\Support;

use App\Modules\Subscriptions\Models\PlatformSetting;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Platform integrations set in the super admin panel (Integrations): payment, AI, WhatsApp, SMS,
 * email, web push keys and the Firebase key (app notifications). A value saved there wins; otherwise the server .env value (through
 * config/*.php) stays in use, so existing .env setups keep working.
 *
 * Stored as one platform_settings row ("integrations"): {"<integration>.<field>": {v, at, by}},
 * secrets encrypted with the app key. apply() copies the saved values into config() early in
 * every request, console command and queued job (AppServiceProvider: boot + Queue::before). The
 * stored row is cached for CACHE_SECONDS and the cache is cleared on save, so a long-running queue
 * worker sees a change at its next job.
 */
class PlatformConfig
{
    public const SETTING = 'integrations';

    public const CACHE_KEY = 'platform:integrations';

    public const CACHE_SECONDS = 60;

    /** Secrets shorter than this never show their last 4 characters. */
    private const LAST4_MIN = 12;

    /**
     * integration => field => [config key, secret, validation rules].
     *
     * @var array<string, array<string, array{0: string, 1: bool, 2: list<string>}>>
     */
    public const FIELDS = [
        'razorpay' => [
            'key_id' => ['dinedesk.platform_razorpay.key_id', false, ['regex:/^rzp_(test|live)_[A-Za-z0-9]+$/', 'max:64']],
            'key_secret' => ['dinedesk.platform_razorpay.key_secret', true, ['max:128']],
            'webhook_secret' => ['dinedesk.platform_razorpay.webhook_secret', true, ['max:128']],
        ],
        'ai' => [
            'api_key' => ['dinedesk.ai.api_key', true, ['max:300']],
            'model' => ['dinedesk.ai.model', false, ['regex:/^[A-Za-z0-9._:@\/\[\]-]+$/', 'max:100']],
        ],
        'whatsapp' => [
            'token' => ['dinedesk.messaging.whatsapp.token', true, ['max:1000']],
            'phone_number_id' => ['dinedesk.messaging.whatsapp.phone_number_id', false, ['regex:/^\d{5,30}$/']],
            'template' => ['dinedesk.messaging.whatsapp.template', false, ['regex:/^[a-z0-9_]+$/', 'max:512']],
            'language' => ['dinedesk.messaging.whatsapp.language', false, ['regex:/^[a-z]{2,3}(_[A-Z]{2})?$/']],
            'api_version' => ['dinedesk.messaging.whatsapp.api_version', false, ['regex:/^v\d{1,3}\.\d{1,2}$/']],
        ],
        'sms' => [
            'auth_key' => ['dinedesk.messaging.sms.auth_key', true, ['max:100']],
            'otp_template_id' => ['dinedesk.messaging.sms.otp_template_id', false, ['regex:/^[A-Za-z0-9]+$/', 'max:64']],
            'code_variable' => ['dinedesk.messaging.sms.code_variable', false, ['regex:/^[A-Za-z0-9_]+$/', 'max:30']],
        ],
        'messaging' => [
            'driver' => ['dinedesk.messaging.driver', false, ['in:log,live']],
        ],
        'mail' => [
            'host' => ['mail.mailers.smtp.host', false, ['regex:/^[A-Za-z0-9.-]+$/', 'max:255']],
            'port' => ['mail.mailers.smtp.port', false, ['integer', 'between:1,65535']],
            'username' => ['mail.mailers.smtp.username', false, ['max:255']],
            'password' => ['mail.mailers.smtp.password', true, ['max:255']],
            // tls = STARTTLS (usually 587), ssl = implicit TLS (465); stored as config scheme smtp / smtps.
            'encryption' => ['mail.mailers.smtp.scheme', false, ['in:tls,ssl,none']],
            'from_address' => ['mail.from.address', false, ['email:rfc', 'max:160']],
            'from_name' => ['mail.from.name', false, ['max:100']],
        ],
        'webpush' => [
            'public_key' => ['dinedesk.webpush.public_key', false, ['max:200']],
            'private_key' => ['dinedesk.webpush.private_key', true, ['max:200']],
        ],
        // The Firebase service-account key (JSON) for notifications in the DineDesk Android app.
        'firebase' => [
            'credentials' => ['dinedesk.firebase.credentials', true, ['max:20000']],
        ],
    ];

    /** Secrets whose last 4 characters say nothing useful (a JSON key ends in "}"). */
    private const NO_LAST4 = ['firebase.credentials'];

    /** Config values as they were before this class changed them (the .env values). */
    private array $original = [];

    /** @var array<string, true> config keys currently set from saved values */
    private array $applied = [];

    public static function isSecret(string $integration, string $field): bool
    {
        return self::FIELDS[$integration][$field][1] ?? false;
    }

    /** Copy saved values into config(). Never throws: before migrations there is nothing to apply. */
    public function apply(): void
    {
        try {
            $stored = $this->stored();
        } catch (Throwable) {
            return;
        }
        $wanted = [];
        foreach (self::FIELDS as $integration => $fields) {
            foreach ($fields as $field => [$key]) {
                $value = $this->decrypt($integration, $field, $stored["{$integration}.{$field}"]['v'] ?? null);
                if ($value !== null) {
                    $wanted[$key] = $this->toConfig($key, $value);
                }
            }
        }
        // An SMTP server saved here is used for all email.
        if (isset($wanted['mail.mailers.smtp.host'])) {
            $wanted['mail.default'] = 'smtp';
        }

        $changed = [];
        foreach ($wanted as $key => $value) {
            if (! array_key_exists($key, $this->original)) {
                $this->original[$key] = config($key);
            }
            if (config($key) !== $value) {
                config([$key => $value]);
                $changed[] = $key;
            }
            $this->applied[$key] = true;
        }
        // Removed here: back to the server's own value.
        foreach (array_keys($this->applied) as $key) {
            if (! array_key_exists($key, $wanted)) {
                config([$key => $this->original[$key] ?? null]);
                unset($this->applied[$key]);
                $changed[] = $key;
            }
        }
        $this->forgetResolved($changed);
    }

    /** The value from the server's .env / config files (what is used when nothing is saved here). */
    public function serverValue(string $integration, string $field): mixed
    {
        $key = self::FIELDS[$integration][$field][0];
        $value = array_key_exists($key, $this->original) ? $this->original[$key] : config($key);

        return $key === 'mail.mailers.smtp.scheme' ? ($value === null ? null : ($value === 'smtps' ? 'ssl' : 'tls')) : $value;
    }

    /** The value in use right now: saved here, else the server's. */
    public function effective(string $integration, string $field): ?string
    {
        $saved = $this->saved($integration, $field);
        $value = $saved ?? $this->serverValue($integration, $field);

        return filled($value) ? (string) $value : null;
    }

    public function saved(string $integration, string $field): ?string
    {
        return $this->decrypt($integration, $field, $this->stored()["{$integration}.{$field}"]['v'] ?? null);
    }

    /**
     * What the panel may see. Secrets never leave the server: only whether one is set and its
     * last 4 characters (long secrets only).
     */
    public function describe(): array
    {
        $stored = $this->stored();
        $out = [];
        foreach (self::FIELDS as $integration => $fields) {
            foreach ($fields as $field => [, $secret]) {
                $saved = $this->decrypt($integration, $field, $stored["{$integration}.{$field}"]['v'] ?? null);
                $server = $this->serverValue($integration, $field);
                $value = $saved ?? (filled($server) ? (string) $server : null);
                $row = [
                    'secret' => $secret,
                    'source' => $saved !== null ? 'saved' : ($value !== null ? 'env' : 'unset'),
                    'updated_at' => $saved !== null ? ($stored["{$integration}.{$field}"]['at'] ?? null) : null,
                ];
                $out[$integration][$field] = $secret
                    ? $row + ['set' => $value !== null, 'last4' => $value !== null && mb_strlen($value) >= self::LAST4_MIN && ! in_array("{$integration}.{$field}", self::NO_LAST4, true) ? mb_substr($value, -4) : null]
                    : $row + ['value' => $value];
            }
        }

        return $out;
    }

    /**
     * Save one integration's fields. $values: field => value (null or '' clears a plain field;
     * an empty secret keeps the saved one). $remove: fields to clear (falls back to the server's).
     *
     * @return array{changed: list<string>, removed: list<string>}
     */
    public function save(string $integration, array $values, array $remove, ?int $userId): array
    {
        $stored = $this->stored(fresh: true);
        $changed = [];
        $removed = [];
        foreach (self::FIELDS[$integration] as $field => [, $secret]) {
            $id = "{$integration}.{$field}";
            if (in_array($field, $remove, true)) {
                if (isset($stored[$id])) {
                    unset($stored[$id]);
                    $removed[] = $field;
                }

                continue;
            }
            if (! array_key_exists($field, $values)) {
                continue;
            }
            $value = is_string($values[$field]) ? trim($values[$field]) : $values[$field];
            if ($value === null || $value === '') {
                if (! $secret && isset($stored[$id])) {
                    unset($stored[$id]);
                    $removed[] = $field;
                }

                continue;
            }
            $value = (string) $value;
            if ($this->decrypt($integration, $field, $stored[$id]['v'] ?? null) === $value) {
                continue;
            }
            $stored[$id] = ['v' => $secret ? Crypt::encryptString($value) : $value, 'at' => now()->toIso8601String(), 'by' => $userId];
            $changed[] = $field;
        }
        if ($changed || $removed) {
            PlatformSetting::updateOrCreate(['key' => self::SETTING], ['value' => $stored]);
            $this->flush();
        }

        return ['changed' => $changed, 'removed' => $removed];
    }

    /** Forget the cached row and apply the saved values again (after a save). */
    public function flush(): void
    {
        Cache::forget(self::CACHE_KEY);
        $this->apply();
    }

    private function stored(bool $fresh = false): array
    {
        $read = fn () => (array) (PlatformSetting::where('key', self::SETTING)->value('value') ?? []);

        return $fresh ? $read() : Cache::remember(self::CACHE_KEY, self::CACHE_SECONDS, $read);
    }

    private function decrypt(string $integration, string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (! self::isSecret($integration, $field)) {
            return (string) $value;
        }
        try {
            return Crypt::decryptString((string) $value);
        } catch (DecryptException) {
            // APP_KEY changed: the saved secret can't be read; the server's value is used instead.
            Log::warning("Saved integration secret {$integration}.{$field} can't be decrypted (APP_KEY changed?). Save it again.");

            return null;
        }
    }

    private function toConfig(string $key, string $value): mixed
    {
        return match ($key) {
            'mail.mailers.smtp.port' => (int) $value,
            'mail.mailers.smtp.scheme' => $value === 'ssl' ? 'smtps' : 'smtp',
            default => $value,
        };
    }

    /** Mailers and notification channels built with old settings are made again on next use. */
    private function forgetResolved(array $changed): void
    {
        if (! $changed) {
            return;
        }
        if (app()->resolved('mail.manager') && array_filter($changed, fn ($k) => str_starts_with($k, 'mail.'))) {
            app('mail.manager')->forgetMailers();
        }
        if (app()->resolved(ChannelManager::class) && in_array('dinedesk.messaging.driver', $changed, true)) {
            app(ChannelManager::class)->forgetDrivers();
        }
    }
}
