<?php

namespace App\Modules\Notify\Support;

use Minishlink\WebPush\VAPID;
use RuntimeException;
use Throwable;

/**
 * New VAPID keys for Web Push (php artisan webpush:vapid and Super admin → Integrations).
 * Windows PHP builds often can't make EC keys without an openssl.cnf; then the key is made with
 * the openssl.cnf that ships with PHP and encoded the same way as the web-push library does.
 */
class VapidKeys
{
    /** @return array{publicKey: string, privateKey: string} base64url */
    public static function create(): array
    {
        try {
            return VAPID::createVapidKeys();
        } catch (Throwable $e) {
            foreach ([getenv('OPENSSL_CONF') ?: null, dirname(PHP_BINARY).'/extras/ssl/openssl.cnf', dirname(PHP_BINARY).'/../extras/ssl/openssl.cnf'] as $config) {
                if ($config && is_file($config) && ($keys = self::withConfig($config))) {
                    return $keys;
                }
            }
            throw new RuntimeException('Could not create VAPID keys: '.$e->getMessage().' (set OPENSSL_CONF to an openssl.cnf).', 0, $e);
        }
    }

    private static function withConfig(string $config): ?array
    {
        $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC, 'config' => $config]);
        $ec = $key ? (openssl_pkey_get_details($key)['ec'] ?? null) : null;
        if (! $ec || ! isset($ec['x'], $ec['y'], $ec['d'])) {
            return null;
        }
        $pad = fn (string $v) => str_pad($v, 32, "\0", STR_PAD_LEFT);
        $b64 = fn (string $v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');

        return ['publicKey' => $b64("\x04".$pad($ec['x']).$pad($ec['y'])), 'privateKey' => $b64($pad($ec['d']))];
    }
}
