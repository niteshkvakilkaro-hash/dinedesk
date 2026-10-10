<?php

namespace App\Modules\Reports\Services;

use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Loyalty\Models\LoyaltyEntry;
use App\Modules\Marketing\Models\CouponRedemption;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderItem;
use App\Modules\Ordering\Support\Money;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Reports from real records only. "Sales" are orders placed in the period that weren't
 * cancelled (and online ones that were paid), at what the guest paid (after discounts).
 * Days, weeks and hours are in the business's timezone.
 */
class Analytics
{
    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} UTC bounds for business-local dates */
    public function bounds(Tenant $tenant, string $from, string $to): array
    {
        $tz = $tenant->timezone;

        return [
            CarbonImmutable::createFromFormat('Y-m-d H:i', "{$from} 00:00", $tz)->utc(),
            CarbonImmutable::createFromFormat('Y-m-d H:i', "{$to} 00:00", $tz)->addDay()->utc(),
        ];
    }

    public function orders(Tenant $tenant, string $from, string $to): Collection
    {
        [$a, $b] = $this->bounds($tenant, $from, $to);

        return Order::where('placed_at', '>=', $a)->where('placed_at', '<', $b)->orderBy('placed_at')->get();
    }

    public static function counts(Order $o): bool
    {
        return $o->status !== 'cancelled' && ! ($o->payment_method === 'online' && $o->payment_status !== 'paid');
    }

    public function overview(Tenant $tenant, string $from, string $to, string $by = 'day'): array
    {
        $tz = $tenant->timezone;
        $all = $this->orders($tenant, $from, $to);
        $orders = $all->filter(fn (Order $o) => self::counts($o))->values();
        $cancelled = $all->where('status', 'cancelled');
        $sum = fn ($rows, string $f = 'total') => Money::toRupees((int) $rows->sum(fn ($r) => Money::toPaise($r->{$f})));
        $local = fn (Order $o) => CarbonImmutable::parse($o->placed_at)->setTimezone($tz);

        // Sales over time (every bucket in the range, empty ones included).
        $key = fn (CarbonImmutable $d) => match ($by) {
            'week' => $d->startOfWeek()->format('Y-m-d'),
            'month' => $d->format('Y-m'),
            default => $d->format('Y-m-d'),
        };
        $buckets = [];
        $cursor = CarbonImmutable::createFromFormat('Y-m-d', $from, $tz)->startOfDay();
        $end = CarbonImmutable::createFromFormat('Y-m-d', $to, $tz)->startOfDay();
        while ($cursor->lte($end)) {
            $buckets[$key($cursor)] ??= ['period' => $key($cursor), 'orders' => 0, 'paise' => 0];
            $cursor = $cursor->addDay();
        }
        foreach ($orders as $o) {
            $k = $key($local($o));
            $buckets[$k] ??= ['period' => $k, 'orders' => 0, 'paise' => 0];
            $buckets[$k]['orders']++;
            $buckets[$k]['paise'] += Money::toPaise($o->total);
        }
        $series = array_values(array_map(fn ($b) => ['period' => $b['period'], 'orders' => $b['orders'], 'sales' => Money::toRupees($b['paise'])], $buckets));

        $group = fn (string $field) => $orders->groupBy($field)->map(fn ($rows, $k) => ['key' => (string) $k, 'orders' => $rows->count(), 'sales' => $sum($rows)])->sortByDesc('orders')->values();

        // Peak hours: weekday (1 = Monday) × hour.
        $heat = [];
        foreach ($orders as $o) {
            $d = $local($o);
            $k = $d->dayOfWeekIso.'-'.$d->hour;
            $heat[$k] = ($heat[$k] ?? 0) + 1;
        }
        $heatmap = collect($heat)->map(fn ($n, $k) => ['day' => (int) explode('-', $k)[0], 'hour' => (int) explode('-', $k)[1], 'orders' => $n])->values();

        // Repeat customers: of the customers who ordered in the period, how many have 2+ orders so far.
        $customerIds = $orders->pluck('customer_id')->filter()->unique();
        $repeat = $customerIds->isEmpty() ? 0 : Order::whereIn('customer_id', $customerIds)->where('status', '!=', 'cancelled')
            ->where('placed_at', '<', $this->bounds($tenant, $from, $to)[1])
            ->selectRaw('customer_id, COUNT(*) as n')->groupBy('customer_id')->get()->where('n', '>=', 2)->count();

        return [
            'from' => $from,
            'to' => $to,
            'by' => $by,
            'totals' => [
                'orders' => $orders->count(),
                'sales' => $sum($orders),
                'gst' => $sum($orders, 'tax_total'),
                'discounts' => $sum($orders, 'discount_total'),
                'average' => $orders->count() ? Money::toRupees(intdiv((int) $orders->sum(fn ($o) => Money::toPaise($o->total)), $orders->count())) : '0.00',
                'cancelled' => $cancelled->count(),
                'cancelled_value' => $sum($cancelled),
                'customers' => $customerIds->count(),
                'repeat_customers' => $repeat,
                'repeat_rate' => $customerIds->count() ? round($repeat / $customerIds->count() * 100, 1) : null,
            ],
            'series' => $series,
            'by_type' => $group('type'),
            'by_payment' => $group('payment_method'),
            'by_source' => $group('source'),
            'heatmap' => $heatmap,
            'dishes' => $this->dishes($orders),
            'categories' => $this->categories($orders),
            'reservations' => $this->reservations($tenant, $from, $to),
            'offers' => $this->offers($tenant, $from, $to),
            'hotel' => app(FeatureService::class)->enabled($tenant, 'hotel') ? $this->hotel($from, $to) : null,
        ];
    }

    /**
     * Rooms: occupancy, nights sold, room revenue (before GST), ADR and RevPAR, from the stays'
     * own nightly prices. Available room-nights use today's sellable rooms.
     */
    public function hotel(string $from, string $to): array
    {
        $days = (int) CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
        $rooms = Room::where('is_active', true)->where('housekeeping', '!=', 'out_of_order')->count();
        $stays = RoomBooking::with('type')->where('check_in', '<=', $to)->where('check_out', '>', $from)->get();
        $sold = $stays->whereIn('status', ['confirmed', 'checked_in', 'checked_out']);
        $perDay = [];
        $nights = $revenue = 0;
        foreach ($sold as $b) {
            foreach ($b->rates as $r) {
                if ($r['date'] >= $from && $r['date'] <= $to) {
                    $nights++;
                    $revenue += Money::toPaise($r['price']);
                    $perDay[$r['date']] = ($perDay[$r['date']] ?? 0) + 1;
                }
            }
        }
        $available = $rooms * $days;
        $series = [];
        for ($d = CarbonImmutable::parse($from); $d->format('Y-m-d') <= $to; $d = $d->addDay()) {
            $n = $perDay[$d->format('Y-m-d')] ?? 0;
            $series[] = ['date' => $d->format('Y-m-d'), 'sold' => $n, 'occupancy' => $rooms ? round($n / $rooms * 100, 1) : 0];
        }
        $arriving = $stays->filter(fn ($b) => $b->check_in->format('Y-m-d') >= $from);

        return [
            'rooms' => $rooms,
            'nights_available' => $available,
            'nights_sold' => $nights,
            'occupancy' => $available ? round($nights / $available * 100, 1) : 0,
            'room_revenue' => Money::toRupees($revenue),
            'adr' => $nights ? Money::toRupees(intdiv($revenue, $nights)) : '0.00',
            'revpar' => $available ? Money::toRupees(intdiv($revenue, $available)) : '0.00',
            'stays' => $sold->count(),
            'average_nights' => $sold->count() ? round($sold->avg('nights'), 1) : null,
            'cancelled' => $arriving->where('status', 'cancelled')->count(),
            'no_shows' => $arriving->where('status', 'no_show')->count(),
            'by_source' => $sold->groupBy('source')->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count()])->values(),
            'by_type' => $sold->groupBy(fn ($b) => $b->type->name)->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count(), 'nights' => (int) $r->sum('nights')])->values(),
            'series' => $series,
        ];
    }

    /** Top sellers and slow movers (every dish on the menu, including ones nobody ordered). */
    public function dishes(Collection $orders): array
    {
        $sold = OrderItem::whereIn('order_id', $orders->pluck('id'))->get()->groupBy('menu_item_id')
            ->map(fn ($rows) => ['quantity' => (int) $rows->sum('quantity'), 'paise' => (int) $rows->sum(fn ($r) => Money::toPaise($r->line_total))]);
        $rows = MenuItem::with('category')->get()->map(fn (MenuItem $i) => [
            'id' => $i->id,
            'name' => $i->name,
            'category' => $i->category?->name,
            'quantity' => $sold[$i->id]['quantity'] ?? 0,
            'sales' => Money::toRupees($sold[$i->id]['paise'] ?? 0),
            'available' => (bool) $i->is_available,
        ]);

        return [
            'top' => $rows->sortByDesc('quantity')->filter(fn ($r) => $r['quantity'] > 0)->take(10)->values(),
            'slow' => $rows->filter(fn ($r) => $r['available'])->sortBy('quantity')->take(10)->values(),
            'all' => $rows->sortByDesc('quantity')->values(),
        ];
    }

    public function categories(Collection $orders): array
    {
        $items = OrderItem::whereIn('order_id', $orders->pluck('id'))->get();
        $catOf = MenuItem::pluck('menu_category_id', 'id');
        $names = MenuCategory::pluck('name', 'id');
        $total = max(1, (int) $items->sum(fn ($r) => Money::toPaise($r->line_total)));

        return $items->groupBy(fn ($r) => $catOf[$r->menu_item_id] ?? 0)->map(function ($rows, $cat) use ($names, $total) {
            $paise = (int) $rows->sum(fn ($r) => Money::toPaise($r->line_total));

            return ['category' => $names[$cat] ?? 'Removed dishes', 'quantity' => (int) $rows->sum('quantity'), 'sales' => Money::toRupees($paise), 'share' => round($paise / $total * 100, 1)];
        })->sortByDesc('sales')->values()->all();
    }

    public function reservations(Tenant $tenant, string $from, string $to): array
    {
        $rows = Reservation::whereDate('date', '>=', $from)->whereDate('date', '<=', $to)->get();
        $held = $rows->whereIn('status', ['confirmed', 'seated', 'completed', 'no_show']);

        return [
            'bookings' => $rows->count(),
            'guests' => (int) $rows->whereIn('status', ['confirmed', 'seated', 'completed'])->sum('party_size'),
            'by_status' => $rows->groupBy('status')->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count()])->values(),
            'by_source' => $rows->groupBy('source')->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count()])->values(),
            'no_show_rate' => $held->count() ? round($held->where('status', 'no_show')->count() / $held->count() * 100, 1) : null,
        ];
    }

    public function offers(Tenant $tenant, string $from, string $to): array
    {
        [$a, $b] = $this->bounds($tenant, $from, $to);
        $coupons = CouponRedemption::whereNull('reversed_at')->where('created_at', '>=', $a)->where('created_at', '<', $b)->get();
        $points = LoyaltyEntry::where('created_at', '>=', $a)->where('created_at', '<', $b)->get();

        return [
            'coupon_uses' => $coupons->count(),
            'coupon_discount' => Money::toRupees((int) $coupons->sum(fn ($r) => Money::toPaise($r->amount))),
            'points_earned' => (int) $points->where('type', 'earn')->sum('points'),
            'points_redeemed' => (int) -$points->where('type', 'redeem')->sum('points'),
        ];
    }
}
