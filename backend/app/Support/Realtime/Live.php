<?php

namespace App\Support\Realtime;

use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Pushes live updates to the dashboard (orders, kitchen, tables, reservations, hotel, riders).
 * Sent after the database commit, and never allowed to break the request: if the
 * WebSocket server is down, screens keep working by polling.
 */
final class Live
{
    public const TOPICS = ['orders', 'kitchen', 'tables', 'reservations', 'hotel', 'riders'];

    /** Channels use the business's public id, never the internal one. */
    private static array $keys = [];

    public static function emit(int $tenantId, string $topic, string $name, array $payload = []): void
    {
        DB::afterCommit(function () use ($tenantId, $topic, $name, $payload) {
            if (config('broadcasting.default') === 'null') {
                return;
            }
            try {
                $key = self::$keys[$tenantId] ??= Tenant::whereKey($tenantId)->value('public_id');
                broadcast(new TenantEvent((string) $key, $topic, $name, $payload));
            } catch (Throwable $e) {
                Log::warning('Live update not sent: '.$e->getMessage(), ['topic' => $topic, 'event' => $name]);
            }
        });
    }
}
