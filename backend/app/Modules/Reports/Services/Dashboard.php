<?php

namespace App\Modules\Reports\Services;

use App\Models\User;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Support\Money;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\Images\ImageService;
use Carbon\CarbonImmutable;

/**
 * The dashboard's home screen: the last 7 days against the 7 before, recent activity and
 * today's rooms. Every number comes from real records, and each block is only sent to
 * people whose role may see it (money needs reports.view).
 */
class Dashboard
{
    public const DAYS = 7;

    public function __construct(
        private readonly Analytics $analytics,
        private readonly FeatureService $features,
        private readonly ImageService $images,
    ) {}

    public function build(Tenant $tenant, User $user): array
    {
        $support = $user->supportSession() !== null;
        $can = fn (string $p) => $support || $user->hasPermissionTo($p);
        $hotel = $this->features->enabled($tenant, 'hotel');
        $canHotel = $hotel && ($can('rooms.manage') || $can('housekeeping.update') || $can('rooms.setup'));
        $tz = $tenant->timezone;
        $today = CarbonImmutable::now($tz);
        $to = $today->format('Y-m-d');
        $from = $today->subDays(self::DAYS - 1)->format('Y-m-d');
        $prevTo = $today->subDays(self::DAYS)->format('Y-m-d');
        $prevFrom = $today->subDays(self::DAYS * 2 - 1)->format('Y-m-d');

        $out = ['from' => $from, 'to' => $to, 'hotel' => $hotel];
        if ($can('reports.view')) {
            $cur = $this->period($tenant, $from, $to, $hotel);
            $prev = $this->period($tenant, $prevFrom, $prevTo, $hotel);
            $change = fn (float $a, float $b) => $b > 0 ? round(($a - $b) / $b * 100) : null;
            $out['stats'] = [
                'bookings' => ['value' => $cur['rooms_booked'] + $cur['tables_booked'], 'rooms' => $cur['rooms_booked'], 'tables' => $cur['tables_booked'], 'change' => $change($cur['rooms_booked'] + $cur['tables_booked'], $prev['rooms_booked'] + $prev['tables_booked'])],
                'orders' => ['value' => $cur['orders']->count(), 'by_type' => $cur['orders']->countBy('type'), 'change' => $change($cur['orders']->count(), $prev['orders']->count())],
                'revenue' => ['value' => Money::toRupees($cur['food_paise'] + $cur['room_paise']), 'restaurant' => Money::toRupees($cur['food_paise']), 'rooms' => Money::toRupees($cur['room_paise']), 'change' => $change($cur['food_paise'] + $cur['room_paise'], $prev['food_paise'] + $prev['room_paise'])],
                'customers' => ['value' => $cur['customers'], 'new' => $cur['new_customers'], 'returning' => $cur['customers'] - $cur['new_customers'], 'change' => $change($cur['customers'], $prev['customers'])],
            ];
            $out['series'] = $cur['series'];
            $out['distribution'] = ['rooms' => $cur['rooms_booked'], 'tables' => $cur['tables_booked'], 'orders' => $cur['orders']->count()];
            $images = MenuItem::pluck('image', 'id');
            $out['top_dishes'] = collect($this->analytics->dishes($cur['orders'])['top'])->take(4)
                ->map(fn ($d) => $d + ['image' => $this->images->present($images[$d['id']] ?? null)['src'] ?? null])->values();
        }
        if ($can('orders.view')) {
            $out['recent_orders'] = Order::where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'))
                ->withSum('items', 'quantity')->latest('id')->limit(5)->get()
                ->map(fn (Order $o) => ['id' => $o->id, 'number' => $o->number, 'customer' => $o->customer_name, 'items' => (int) $o->items_sum_quantity, 'total' => $o->total, 'status' => $o->status, 'at' => $o->placed_at->toIso8601String()]);
        }
        $bookings = collect();
        if ($can('reservations.manage')) {
            $bookings = $bookings->concat(Reservation::latest('id')->limit(5)->get()->map(fn (Reservation $r) => [
                'kind' => 'table', 'code' => $r->code, 'name' => $r->name, 'when' => $r->date->format('Y-m-d').' '.$r->time, 'party' => $r->party_size, 'status' => $r->status, 'amount' => null, 'at' => $r->created_at->toIso8601String(),
            ]));
        }
        if ($canHotel) {
            $bookings = $bookings->concat(RoomBooking::with('type')->latest('id')->limit(5)->get()->map(fn (RoomBooking $b) => [
                'kind' => 'room', 'code' => $b->code, 'name' => $b->name, 'when' => $b->check_in->format('Y-m-d').' '.$b->check_out->format('Y-m-d'), 'party' => $b->adults + $b->children, 'status' => $b->status, 'amount' => $b->total, 'room_type' => $b->type?->name, 'at' => $b->created_at->toIso8601String(),
            ]));
        }
        if ($can('reservations.manage') || $canHotel) {
            $out['recent_bookings'] = $bookings->sortByDesc('at')->take(5)->values();
        }
        if ($canHotel) {
            $out['rooms'] = $this->roomsTonight($to);
        }
        if ($can('customers.view')) {
            $out['recent_customers'] = Customer::whereNotNull('last_order_at')->latest('last_order_at')->limit(5)->get()
                ->map(fn (Customer $c) => ['id' => $c->id, 'name' => $c->name, 'orders' => (int) $c->orders_count, 'last' => $c->last_order_at->toIso8601String()]);
        }

        return $out;
    }

    /** @return array<string, mixed> */
    private function period(Tenant $tenant, string $from, string $to, bool $hotel): array
    {
        [$a, $b] = $this->analytics->bounds($tenant, $from, $to);
        $orders = $this->analytics->orders($tenant, $from, $to)->filter(fn (Order $o) => Analytics::counts($o))->values();
        $tz = $tenant->timezone;

        $days = [];
        for ($d = CarbonImmutable::parse($from); $d->format('Y-m-d') <= $to; $d = $d->addDay()) {
            $days[$d->format('Y-m-d')] = ['date' => $d->format('Y-m-d'), 'restaurant' => 0, 'rooms' => 0];
        }
        $food = 0;
        foreach ($orders as $o) {
            $p = Money::toPaise($o->total);
            $food += $p;
            $days[CarbonImmutable::parse($o->placed_at)->setTimezone($tz)->format('Y-m-d')]['restaurant'] += $p;
        }
        // Room revenue: each night sold in the period at its own price (before GST), as in Reports.
        $room = 0;
        $roomsBooked = 0;
        if ($hotel) {
            foreach (RoomBooking::whereIn('status', ['confirmed', 'checked_in', 'checked_out'])->where('check_in', '<=', $to)->where('check_out', '>', $from)->get() as $bk) {
                foreach ($bk->rates as $r) {
                    if ($r['date'] >= $from && $r['date'] <= $to) {
                        $room += Money::toPaise($r['price']);
                        $days[$r['date']]['rooms'] += Money::toPaise($r['price']);
                    }
                }
            }
            $roomsBooked = RoomBooking::where('created_at', '>=', $a)->where('created_at', '<', $b)->whereNotIn('status', ['cancelled'])->count();
        }
        $customerIds = $orders->pluck('customer_id')->filter()->unique();

        return [
            'orders' => $orders,
            'food_paise' => $food,
            'room_paise' => $room,
            'rooms_booked' => $roomsBooked,
            'tables_booked' => Reservation::where('created_at', '>=', $a)->where('created_at', '<', $b)->whereNotIn('status', ['cancelled', 'rejected'])->count(),
            'customers' => $customerIds->count(),
            'new_customers' => $customerIds->isEmpty() ? 0 : Customer::whereIn('id', $customerIds)->where('created_at', '>=', $a)->count(),
            'series' => array_values(array_map(fn ($d) => ['date' => $d['date'], 'restaurant' => Money::toRupees($d['restaurant']), 'rooms' => Money::toRupees($d['rooms'])], $days)),
        ];
    }

    /** Each room type: how many sellable rooms are free tonight. */
    private function roomsTonight(string $today): array
    {
        $rooms = Room::where('is_active', true)->where('housekeeping', '!=', 'out_of_order')->get()->countBy('room_type_id');
        $taken = RoomBooking::whereIn('status', RoomBooking::HOLDING)->where('check_in', '<=', $today)->where('check_out', '>', $today)->get()->countBy('room_type_id');

        return RoomType::where('is_active', true)->orderBy('sort_order')->get()->map(function (RoomType $t) use ($rooms, $taken) {
            $total = (int) ($rooms[$t->id] ?? 0);
            $photo = collect($t->photos ?? [])->first();

            return [
                'id' => $t->id,
                'name' => $t->name,
                'total' => $total,
                'free' => max(0, $total - (int) ($taken[$t->id] ?? 0)),
                'image' => $photo ? ($this->images->present($photo['image'] ?? null)['src'] ?? null) : null,
            ];
        })->values()->all();
    }
}
