<?php

use App\Models\User;
use App\Support\Realtime\Live;
use Illuminate\Support\Facades\Broadcast;

/*
 * Private live-update channels, one per business and topic. The auth endpoint runs
 * behind auth:sanctum + tenant.user, so the tenant context is the user's own business.
 */
Broadcast::channel('tenant.{tenantKey}.{topic}', function (User $user, string $tenantKey, string $topic) {
    if (! $user->tenant || $user->tenant->public_id !== $tenantKey || ! in_array($topic, Live::TOPICS, true)) {
        return false;
    }
    $can = fn (string ...$perms) => (bool) array_intersect($perms, $user->tenantPermissions());

    return match ($topic) {
        'orders' => $can('orders.view'),
        'kitchen' => $can('kot.update', 'orders.view'),
        'tables' => $can('tables.manage', 'tables.setup', 'orders.create'),
        'reservations' => $can('reservations.manage'),
        'hotel' => $can('rooms.manage', 'housekeeping.update'),
        // Riders' positions: only those who assign deliveries (never other riders).
        'riders' => $can('orders.manage'),
    };
});
