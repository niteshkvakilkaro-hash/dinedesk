<?php

namespace App\Modules\Delivery\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Delivery\Models\RiderLocation;
use App\Modules\Delivery\Services\Riders;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The rider's own screen (/rider/): duty on/off, their assigned orders, picked up / delivered,
 * and the location batches their phone sends while on duty (deliveries.run).
 */
class RiderController extends Controller
{
    public function __construct(private readonly Riders $riders) {}

    public function show(Request $request): JsonResponse
    {
        return $this->ok($this->state($request));
    }

    public function duty(Request $request): JsonResponse
    {
        $data = $request->validate(['on' => ['required', 'boolean']]);
        $user = $request->user();
        if (! $data['on']) {
            $this->riders->endDuty($user);

            return $this->ok($this->state($request) + ['sharing' => null], 'You are off duty. Location sharing has stopped.');
        }
        $started = $this->riders->startDuty($user);

        return $this->ok($this->state($request) + ['sharing' => [
            // For the app's background service (Authorization: Bearer <token>); see docs/openapi.yaml.
            'token' => $started['token'],
            'expires_at' => $started['expires_at']->toIso8601String(),
            'interval_sec' => Riders::interval(),
        ]], 'You are on duty. Your location is shared with the restaurant every few minutes.');
    }

    /** A batch of positions (the app may send several it kept while offline). */
    public function locations(Request $request): JsonResponse
    {
        $data = $request->validate([
            'points' => ['required', 'array', 'min:1', 'max:50'],
            'points.*' => ['required', 'array'],
            'points.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'points.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'points.*.accuracy_m' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'points.*.speed' => ['nullable', 'numeric', 'min:0', 'max:200'],
            'points.*.heading' => ['nullable', 'numeric', 'min:0', 'max:360'],
            'points.*.battery' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'points.*.recorded_at' => ['required', 'date', 'before_or_equal:'.now()->addMinutes(2)->toIso8601String(), 'after_or_equal:'.now()->subDay()->toIso8601String()],
        ], [
            'points.*.recorded_at.before_or_equal' => 'A location has a time in the future. Check the phone\'s clock.',
            'points.*.recorded_at.after_or_equal' => 'A location is more than a day old.',
        ]);
        $result = $this->riders->record($request->user(), $data['points']);

        return $this->ok($result + ['interval_sec' => Riders::interval()]);
    }

    /** Picked up (out for delivery) or delivered, only on the rider's own orders. */
    public function status(Request $request, int $id, OrderFlow $flow): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(Riders::RIDER_STATUSES)]]);
        $order = Order::where('rider_id', $request->user()->id)->findOrFail($id);
        $flow->transition($order, $data['status'], $request->user());

        return $this->ok($this->state($request), 'Order updated.');
    }

    private function state(Request $request): array
    {
        $user = $request->user();
        $duty = $this->riders->currentDuty($user);
        $last = RiderLocation::where('user_id', $user->id)->orderByDesc('recorded_at')->value('recorded_at');

        return [
            'on_duty' => (bool) $duty,
            'duty_started_at' => $duty?->started_at->toIso8601String(),
            'last_sent_at' => $last ? $last->toIso8601String() : null,
            'interval_sec' => Riders::interval(),
            'orders' => $this->riders->ordersFor($user)->map(fn (Order $o) => self::order($o))->values(),
        ];
    }

    public static function order(Order $o): array
    {
        $unpaidCash = $o->payment_method === 'cod' && $o->payment_status !== 'paid';

        return [
            'id' => $o->id,
            'number' => $o->number,
            'status' => $o->status,
            'customer_name' => $o->customer_name,
            'customer_phone' => $o->customer_phone,
            'address' => $o->address,
            'notes' => $o->notes,
            'items_count' => (int) ($o->items_sum_quantity ?? $o->items()->sum('quantity')),
            'total' => $o->total,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
            // Cash to collect at the door.
            'collect' => $unpaidCash ? $o->total : null,
            'placed_at' => $o->placed_at->toIso8601String(),
            'scheduled_for' => $o->scheduled_for?->toIso8601String(),
            'next' => match ($o->status) {
                'ready' => 'out_for_delivery',
                'out_for_delivery' => 'completed',
                default => null,
            },
        ];
    }
}
