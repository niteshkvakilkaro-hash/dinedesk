<?php

namespace App\Modules\Delivery\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Delivery\Models\RiderDuty;
use App\Modules\Delivery\Models\RiderLocation;
use App\Modules\Delivery\Notifications\RiderAssigned;
use App\Modules\Identity\Support\Roles;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Realtime\Live;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Delivery riders: who takes which delivery order, when a rider is on duty, and where their
 * phone was while on duty. Every query runs inside the business in context.
 */
class Riders
{
    /** The rider's own upload token (the app's background service): only for POST rider/locations. */
    public const TOKEN_NAME = 'rider-location';

    /** Statuses a rider moves their order to (the normal order flow checks the step). */
    public const RIDER_STATUSES = ['out_for_delivery', 'completed'];

    public function __construct(private readonly TenantContext $context) {}

    public static function interval(): int
    {
        return max(60, (int) config('dinedesk.riders.location_interval', 300));
    }

    /** Active team members with the delivery role. */
    public function riders(): Builder
    {
        return User::query()
            ->where('tenant_id', $this->context->id())
            ->where('status', 'active')
            ->whereHas('roles', fn ($q) => $q->where('name', Roles::DELIVERY));
    }

    /** A rider of this business, or a clear error (another business's user simply isn't found). */
    public function findRider(int $id): User
    {
        $user = User::where('tenant_id', $this->context->id())->find($id);
        if (! $user || ! $this->riders()->whereKey($id)->exists()) {
            throw new ApiException('Choose a team member with the Delivery rider role.', 422, 'not_a_rider', ['field' => 'rider_id']);
        }

        return $user;
    }

    /** Gives a delivery order to a rider (null takes it back). The rider gets a push alert. */
    public function assign(Order $order, ?int $riderId, User $by): Order
    {
        if ($order->type !== 'delivery') {
            throw new ApiException('Only delivery orders have a rider.', 422, 'not_delivery');
        }
        if (! $order->isActive()) {
            throw new ApiException('This order is already finished.', 422, 'order_closed');
        }
        $rider = $riderId ? $this->findRider($riderId) : null;
        if ($order->rider_id === $rider?->id) {
            return $order;
        }

        DB::transaction(function () use ($order, $rider, $by) {
            $previous = $order->rider_id;
            $order->update(['rider_id' => $rider?->id, 'rider_assigned_at' => $rider ? now() : null]);
            OrderEvent::create([
                'order_id' => $order->id,
                'status' => $rider ? 'rider_assigned' : 'rider_unassigned',
                'note' => $rider?->name ?? User::whereKey($previous)->value('name'),
                'user_id' => $by->id,
                'created_at' => now(),
            ]);
            AuditLog::record($rider ? 'order.rider_assigned' : 'order.rider_unassigned', $order, ['number' => $order->number, 'rider_id' => $rider?->id ?? $previous]);
        });

        if ($rider) {
            $rider->notify(new RiderAssigned($order));
        }
        app(OrderFlow::class)->emitOrder($order, 'order.changed');
        Live::emit($order->tenant_id, 'riders', 'rider.assigned', ['order_id' => $order->id, 'rider_id' => $rider?->id]);

        return $order->fresh(['items', 'events', 'rider']);
    }

    /** The rider's open duty; one left on past max_duty_hours ends by itself. */
    public function currentDuty(User $rider): ?RiderDuty
    {
        $duty = RiderDuty::where('user_id', $rider->id)->whereNull('ended_at')->latest('id')->first();
        $max = (int) config('dinedesk.riders.max_duty_hours', 14);
        if ($duty && $duty->started_at->lt(now()->subHours($max))) {
            $duty->update(['ended_at' => $duty->started_at->addHours($max)]);

            return null;
        }

        return $duty;
    }

    /**
     * On duty: location sharing starts. Returns a fresh upload token for the app's background
     * service (it can only send locations, and expires a little after the longest duty).
     *
     * @return array{duty: RiderDuty, token: string, expires_at: CarbonImmutable}
     */
    public function startDuty(User $rider): array
    {
        $duty = $this->currentDuty($rider) ?? RiderDuty::create(['user_id' => $rider->id, 'started_at' => now()]);
        $rider->tokens()->where('name', self::TOKEN_NAME)->delete();
        $expires = CarbonImmutable::now()->addHours((int) config('dinedesk.riders.max_duty_hours', 14) + 2);
        $token = $rider->createToken(self::TOKEN_NAME, ['rider:locations'], $expires)->plainTextToken;
        Live::emit($duty->tenant_id, 'riders', 'rider.duty', ['rider_id' => $rider->id, 'on' => true]);

        return ['duty' => $duty, 'token' => $token, 'expires_at' => $expires];
    }

    /** Off duty: no more locations are stored for this rider until the next duty. */
    public function endDuty(User $rider): void
    {
        $duty = $this->currentDuty($rider);
        if ($duty) {
            $duty->update(['ended_at' => now()]);
            Live::emit($duty->tenant_id, 'riders', 'rider.duty', ['rider_id' => $rider->id, 'on' => false]);
        }
    }

    /**
     * Stores a batch of positions. Only points taken during one of the rider's duties are kept
     * (a phone that was offline may send them a little later); the same point sent twice is
     * stored once.
     *
     * @param  list<array{lat: float, lng: float, recorded_at: string, accuracy_m?: ?int, speed?: ?float, heading?: ?int, battery?: ?int}>  $points
     * @return array{accepted: int, on_duty: bool}
     */
    public function record(User $rider, array $points): array
    {
        $onDuty = (bool) $this->currentDuty($rider);
        $duties = RiderDuty::where('user_id', $rider->id)
            ->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>=', now()->subDay()))
            ->get(['started_at', 'ended_at']);
        $grace = 60;
        $rows = [];
        foreach ($points as $p) {
            $at = CarbonImmutable::parse($p['recorded_at'])->utc();
            $within = $duties->contains(fn (RiderDuty $d) => $at->gte($d->started_at->subSeconds($grace)) && $at->lte(($d->ended_at ?? now()->addMinutes(2))->addSeconds($grace)));
            if (! $within) {
                continue;
            }
            $rows[] = [
                'tenant_id' => $this->context->id(),
                'user_id' => $rider->id,
                'lat' => round((float) $p['lat'], 7),
                'lng' => round((float) $p['lng'], 7),
                'accuracy_m' => isset($p['accuracy_m']) ? (int) round($p['accuracy_m']) : null,
                'speed' => isset($p['speed']) ? round((float) $p['speed'], 2) : null,
                'heading' => isset($p['heading']) ? (int) round($p['heading']) % 360 : null,
                'battery' => isset($p['battery']) ? (int) round($p['battery']) : null,
                'recorded_at' => $at->format('Y-m-d H:i:s'),
                'created_at' => now(),
            ];
        }
        if (! $rows && ! $onDuty) {
            throw new ApiException('You are off duty, so your location is not being recorded.', 409, 'not_on_duty');
        }
        $accepted = $rows ? RiderLocation::query()->insertOrIgnore($rows) : 0;
        if ($accepted > 0) {
            Live::emit($this->context->id(), 'riders', 'rider.location', ['rider_id' => $rider->id]);
        }

        return ['accepted' => $accepted, 'on_duty' => $onDuty];
    }

    /** @return array<int, RiderLocation> the newest position of each rider */
    public function latest(array $riderIds): array
    {
        $out = [];
        foreach ($riderIds as $id) {
            $point = RiderLocation::where('user_id', $id)->orderByDesc('recorded_at')->first();
            if ($point) {
                $out[$id] = $point;
            }
        }

        return $out;
    }

    /** One rider's route on a day (the business's local day), oldest first. */
    public function trail(User $rider, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        return RiderLocation::where('user_id', $rider->id)
            ->whereBetween('recorded_at', [$from->utc(), $to->utc()])
            ->orderBy('recorded_at')
            ->limit(3000)
            ->get();
    }

    /** Active delivery orders given to this rider, oldest first. */
    public function ordersFor(User $rider): Collection
    {
        return Order::withSum('items', 'quantity')
            ->where('rider_id', $rider->id)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->orderBy('placed_at')
            ->get();
    }

    /**
     * What the guest sees on the tracking page: only while the order is out for delivery, only
     * the rider's first name and last position, and only when that position is recent.
     */
    public function forGuest(Order $order): ?array
    {
        if ($order->status !== 'out_for_delivery' || ! $order->rider_id) {
            return null;
        }
        $point = RiderLocation::where('user_id', $order->rider_id)
            ->where('recorded_at', '>=', now()->subMinutes((int) config('dinedesk.riders.guest_max_age_minutes', 30)))
            ->orderByDesc('recorded_at')
            ->first();
        if (! $point) {
            return null;
        }
        $name = (string) User::whereKey($order->rider_id)->value('name');

        return [
            'name_first' => strtok(trim($name), ' ') ?: null,
            'lat' => round($point->lat, 5),
            'lng' => round($point->lng, 5),
            'at' => $point->recorded_at->toIso8601String(),
        ];
    }

    /** Points past the keep period, across all businesses (scheduled daily). */
    public static function purge(): int
    {
        $before = now()->subDays(max(1, (int) config('dinedesk.riders.retention_days', 7)));
        $total = 0;
        do {
            $deleted = RiderLocation::withoutTenancy()->where('recorded_at', '<', $before)->limit(5000)->delete();
            $total += $deleted;
        } while ($deleted > 0);

        // Duties left open far too long end by themselves (no more points are taken for them).
        $max = (int) config('dinedesk.riders.max_duty_hours', 14);
        RiderDuty::withoutTenancy()->whereNull('ended_at')->where('started_at', '<', now()->subHours($max))
            ->update(['ended_at' => DB::raw('DATE_ADD(started_at, INTERVAL '.$max.' HOUR)'), 'updated_at' => now()]);

        return $total;
    }
}
