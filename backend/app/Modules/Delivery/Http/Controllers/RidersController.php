<?php

namespace App\Modules\Delivery\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Delivery\Models\RiderDuty;
use App\Modules\Delivery\Services\Riders;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderPresenter;
use App\Modules\Tenancy\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Dashboard → Riders (orders.manage): where riders are, what they carry, and who takes which order. */
class RidersController extends Controller
{
    public function __construct(
        private readonly Riders $riders,
        private readonly TenantContext $context,
    ) {}

    public function index(): JsonResponse
    {
        $riders = $this->riders->riders()->orderBy('name')->get(['id', 'name', 'phone']);
        $ids = $riders->pluck('id')->all();
        $latest = $this->riders->latest($ids);
        $duties = RiderDuty::whereIn('user_id', $ids)->whereNull('ended_at')->get()->keyBy('user_id');
        $orders = Order::whereIn('rider_id', $ids)->whereNotIn('status', ['completed', 'cancelled'])->orderBy('placed_at')->get()->groupBy('rider_id');
        $max = (int) config('dinedesk.riders.max_duty_hours', 14);

        $list = $riders->map(function (User $r) use ($latest, $duties, $orders, $max) {
            $duty = $duties->get($r->id);
            $onDuty = $duty && $duty->started_at->gte(now()->subHours($max));

            return [
                'id' => $r->id,
                'name' => $r->name,
                'phone' => $r->phone,
                'on_duty' => $onDuty,
                'duty_started_at' => $onDuty ? $duty->started_at->toIso8601String() : null,
                'last' => isset($latest[$r->id]) ? $latest[$r->id]->present() : null,
                'orders' => ($orders->get($r->id) ?? collect())->map(fn (Order $o) => $this->brief($o))->values(),
            ];
        })->values();

        // Delivery orders still waiting for a rider (paid online ones and every pay-later one).
        $unassigned = Order::where('type', 'delivery')->whereNull('rider_id')
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'))
            ->orderBy('placed_at')->limit(50)->get()
            ->map(fn (Order $o) => $this->brief($o))->values();

        return $this->ok(['riders' => $list, 'unassigned' => $unassigned], null, [
            'interval_sec' => Riders::interval(),
            'stale_minutes' => (int) config('dinedesk.riders.stale_minutes', 15),
        ]);
    }

    /** One rider's route for a day (default today, in the business's timezone). */
    public function trail(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);
        $rider = $this->riders->findRider($id);
        $tz = $this->context->require()->timezone;
        $day = isset($data['date']) ? CarbonImmutable::parse($data['date'], $tz) : CarbonImmutable::now($tz);
        $points = $this->riders->trail($rider, $day->startOfDay(), $day->endOfDay());

        return $this->ok([
            'rider_id' => $rider->id,
            'date' => $day->format('Y-m-d'),
            'points' => $points->map(fn ($p) => ['lat' => $p->lat, 'lng' => $p->lng, 'at' => $p->recorded_at->toIso8601String()])->values(),
        ]);
    }

    /** Give a delivery order to a rider, or take it back (rider_id null). */
    public function assign(Request $request, int $id, OrderPresenter $presenter): JsonResponse
    {
        $data = $request->validate(['rider_id' => ['present', 'nullable', 'integer']]);
        $order = $this->riders->assign(Order::findOrFail($id), $data['rider_id'], $request->user());

        return $this->ok($presenter->forStaff($order), $data['rider_id'] ? 'Rider assigned.' : 'Rider removed.');
    }

    private function brief(Order $o): array
    {
        $a = (array) $o->address;

        return [
            'id' => $o->id,
            'number' => $o->number,
            'status' => $o->status,
            'customer_name' => $o->customer_name,
            'address' => implode(', ', array_filter([$a['line1'] ?? null, $a['landmark'] ?? null, $a['pincode'] ?? null])),
            'lat' => $a['lat'] ?? null,
            'lng' => $a['lng'] ?? null,
            'total' => $o->total,
            'payment_method' => $o->payment_method,
            'placed_at' => $o->placed_at->toIso8601String(),
        ];
    }
}
