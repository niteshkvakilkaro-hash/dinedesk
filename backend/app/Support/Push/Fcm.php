<?php

namespace App\Support\Push;

use App\Support\ApiException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Firebase Cloud Messaging (HTTP v1): notifications on phones with the DineDesk Android app.
 *
 * The credentials are a Firebase service-account key (JSON with project_id, client_email,
 * private_key): saved in Super admin → Integrations (encrypted), else FIREBASE_CREDENTIALS in the
 * server .env (the JSON itself or a path to the file). The key signs a short JWT (RS256) that
 * Google's token endpoint swaps for an OAuth2 access token, cached ~55 minutes.
 */
class Fcm
{
    public const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    public const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    public const SEND_URL = 'https://fcm.googleapis.com/v1/projects/%s/messages:send';

    /** Android notification channels made by the app: "orders" rings (new orders, bookings, rider jobs). */
    public const CHANNELS = ['orders', 'general'];

    /** send() results. */
    public const SENT = 'sent';

    public const INVALID = 'invalid';

    public const FAILED = 'failed';

    /** The last parsed config value (asked for every staff member of every order). */
    private static ?string $parsedFrom = null;

    private static ?array $parsed = null;

    /** @return array{project_id: string, client_email: string, private_key: string}|null */
    public static function credentials(): ?array
    {
        $value = (string) config('dinedesk.firebase.credentials');
        if ($value !== self::$parsedFrom) {
            self::$parsed = self::parse($value);
            self::$parsedFrom = $value;
        }

        return self::$parsed;
    }

    public static function configured(): bool
    {
        return self::credentials() !== null;
    }

    /**
     * A service-account key from its JSON, or from a path to the JSON file (relative paths: from
     * the backend folder). Null when it isn't a usable key.
     *
     * @return array{project_id: string, client_email: string, private_key: string}|null
     */
    public static function parse(?string $value): ?array
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        if (! str_starts_with($value, '{')) {
            $path = preg_match('#^([a-zA-Z]:)?[\\\\/]#', $value) ? $value : base_path($value);
            if (! is_file($path) || filesize($path) > 20000) {
                return null;
            }
            $value = (string) file_get_contents($path);
        }
        $json = json_decode($value, true);
        if (! is_array($json)) {
            return null;
        }
        $key = [
            'project_id' => (string) ($json['project_id'] ?? ''),
            'client_email' => (string) ($json['client_email'] ?? ''),
            'private_key' => (string) ($json['private_key'] ?? ''),
        ];
        if (! preg_match('/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/', $key['project_id'])
            || ! filter_var($key['client_email'], FILTER_VALIDATE_EMAIL)
            || ! str_contains($key['private_key'], 'PRIVATE KEY')
            || openssl_pkey_get_private($key['private_key']) === false) {
            return null;
        }

        return $key;
    }

    /** What the panel may see of the key in use (never the private key). */
    public static function summary(): ?array
    {
        $c = self::credentials();

        return $c ? ['project_id' => $c['project_id'], 'client_email' => $c['client_email']] : null;
    }

    /** The signed JWT for Google's token endpoint. */
    public static function jwt(array $credentials, ?int $now = null): string
    {
        $now ??= time();
        $b64 = fn (string $v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $head = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claims = $b64(json_encode([
            'iss' => $credentials['client_email'],
            'scope' => self::SCOPE,
            'aud' => self::TOKEN_URL,
            'iat' => $now,
            'exp' => $now + 3600,
        ]));
        $signature = '';
        if (! openssl_sign("{$head}.{$claims}", $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
            throw new ApiException('The Firebase private key could not sign a request.', 422, 'fcm_key');
        }

        return "{$head}.{$claims}.".$b64($signature);
    }

    /** An OAuth2 access token for FCM, cached until shortly before it expires. */
    public function accessToken(bool $fresh = false): string
    {
        $c = self::credentials() ?? throw new ApiException('Firebase is not set up.', 422, 'fcm_off');
        $key = self::cacheKey($c);
        if ($fresh) {
            Cache::forget($key);
        }
        if (is_string($token = Cache::get($key))) {
            return $token;
        }
        $r = Http::asForm()->acceptJson()->timeout(15)->post(self::TOKEN_URL, [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => self::jwt($c),
        ]);
        $token = $r->json('access_token');
        if (! $r->successful() || ! is_string($token) || $token === '') {
            throw new ApiException('Google refused the Firebase key: '.($r->json('error_description') ?: $r->json('error') ?: 'HTTP '.$r->status()), 422, 'fcm_auth');
        }
        $ttl = max(60, min(3300, (int) ($r->json('expires_in') ?? 3600) - 300));
        Cache::put($key, $token, $ttl);

        return $token;
    }

    /**
     * Sends one notification to one device. INVALID = the token is gone (app removed, signed out
     * of Google services, never valid): the caller deletes the device.
     *
     * @param  array{title: string, body: string, url?: string, kind?: string, tag?: string}  $payload
     */
    public function send(string $deviceToken, array $payload, string $channel = 'general'): string
    {
        $c = self::credentials();
        if (! $c) {
            return self::FAILED;
        }
        $message = self::message($deviceToken, $payload, $channel);
        $url = sprintf(self::SEND_URL, $c['project_id']);
        try {
            $r = Http::withToken($this->accessToken())->acceptJson()->timeout(15)->post($url, ['message' => $message]);
            if ($r->status() === 401) {
                // The cached access token was revoked: once more with a new one.
                $r = Http::withToken($this->accessToken(fresh: true))->acceptJson()->timeout(15)->post($url, ['message' => $message]);
            }
        } catch (ApiException $e) {
            Log::warning('FCM: '.$e->getMessage());

            return self::FAILED;
        } catch (Throwable $e) {
            Log::warning('FCM request failed: '.$e->getMessage());

            return self::FAILED;
        }
        if ($r->successful()) {
            return self::SENT;
        }
        $codes = collect((array) $r->json('error.details'))->pluck('errorCode')->filter()->all();
        $status = (string) $r->json('error.status');
        if ($r->status() === 404 || in_array('UNREGISTERED', $codes, true) || $status === 'NOT_FOUND'
            || ($r->status() === 400 && (in_array('INVALID_ARGUMENT', $codes, true) || $status === 'INVALID_ARGUMENT'))) {
            return self::INVALID;
        }
        Log::warning('FCM send failed: HTTP '.$r->status().' '.($r->json('error.message') ?: ''));

        return self::FAILED;
    }

    /** The FCM v1 message: shown by Android itself when the app is closed, by the app when it is open. */
    public static function message(string $deviceToken, array $payload, string $channel = 'general'): array
    {
        $channel = in_array($channel, self::CHANNELS, true) ? $channel : 'general';
        $title = mb_substr((string) ($payload['title'] ?? 'DineDesk'), 0, 200);
        $body = mb_substr((string) ($payload['body'] ?? ''), 0, 1000);
        $data = array_filter([
            'url' => (string) ($payload['url'] ?? ''),
            'kind' => (string) ($payload['kind'] ?? ''),
            'channel' => $channel,
            // The app shows open-app messages itself: it needs the texts in data too.
            'title' => $title,
            'body' => $body,
        ], fn ($v) => $v !== '');
        $notification = array_filter([
            'channel_id' => $channel,
            'click_action' => 'com.dinedesk.app.OPEN_PUSH',
            'tag' => isset($payload['tag']) ? mb_substr((string) $payload['tag'], 0, 64) : null,
            'default_sound' => true,
        ], fn ($v) => $v !== null);

        return [
            'token' => $deviceToken,
            'notification' => ['title' => $title, 'body' => $body],
            'data' => $data,
            'android' => ['priority' => 'high', 'ttl' => '600s', 'notification' => $notification],
        ];
    }

    private static function cacheKey(array $credentials): string
    {
        return 'fcm:access:'.sha1($credentials['client_email'].'|'.$credentials['private_key']);
    }
}
