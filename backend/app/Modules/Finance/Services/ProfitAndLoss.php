<?php

namespace App\Modules\Finance\Services;

use App\Modules\Finance\Models\Expense;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Inventory\Models\Recipe;
use App\Modules\Inventory\Models\StockMovement;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Support\Money;
use App\Modules\Reports\Services\Analytics;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;

/**
 * Profit and loss from the business's own records, all before GST (GST is collected for the
 * government, not earned):
 *   revenue  = orders that count as sales (after discounts, without GST) + room nights sold
 *   food cost = ingredients used by recipes when orders were cooked (minus returns), at cost price
 *   expenses = what the owner recorded (rent, salaries, gas ...)
 * Food cost is only as complete as the recipes and ingredient costs entered: the result says so.
 */
class ProfitAndLoss
{
    public function __construct(private readonly Analytics $analytics) {}

    public function period(Tenant $tenant, string $from, string $to): array
    {
        [$a, $b] = $this->analytics->bounds($tenant, $from, $to);
        $tz = $tenant->timezone;
        $days = [];
        for ($d = CarbonImmutable::parse($from); $d->format('Y-m-d') <= $to; $d = $d->addDay()) {
            $days[$d->format('Y-m-d')] = ['date' => $d->format('Y-m-d'), 'revenue' => 0, 'food_cost' => 0, 'expenses' => 0];
        }

        // Restaurant: paid / payable orders, without GST.
        $food = 0;
        foreach ($this->analytics->orders($tenant, $from, $to)->filter(fn (Order $o) => Analytics::counts($o)) as $o) {
            $p = Money::toPaise($o->total) - Money::toPaise($o->tax_total);
            $food += $p;
            $days[CarbonImmutable::parse($o->placed_at)->setTimezone($tz)->format('Y-m-d')]['revenue'] += $p;
        }
        // Rooms: each night sold in the period at its own price (before GST).
        $rooms = 0;
        foreach (RoomBooking::whereIn('status', ['confirmed', 'checked_in', 'checked_out'])->where('check_in', '<=', $to)->where('check_out', '>', $from)->get() as $bk) {
            foreach ($bk->rates as $r) {
                if ($r['date'] >= $from && $r['date'] <= $to) {
                    $rooms += Money::toPaise($r['price']);
                    $days[$r['date']]['revenue'] += Money::toPaise($r['price']);
                }
            }
        }

        // Food cost: stock taken by recipes (sale) less what came back (return), at cost price.
        $costs = InventoryItem::pluck('cost_per_unit', 'id');
        $cogs = 0;
        foreach (StockMovement::whereIn('type', ['sale', 'return'])->where('created_at', '>=', $a)->where('created_at', '<', $b)->get() as $m) {
            $unit = $m->unit_cost ?? $costs[$m->inventory_item_id] ?? null;
            if ($unit === null) {
                continue; // counted under coverage.ingredients_without_cost
            }
            $p = (int) round(-(float) $m->quantity * Money::toPaise($unit));
            $cogs += $p;
            $days[CarbonImmutable::parse($m->created_at)->setTimezone($tz)->format('Y-m-d')]['food_cost'] += $p;
        }

        $expenses = Expense::whereBetween('date', [$from, $to])->get();
        foreach ($expenses as $e) {
            $days[$e->date->format('Y-m-d')]['expenses'] += Money::toPaise($e->amount);
        }
        $exp = (int) $expenses->sum(fn ($e) => Money::toPaise($e->amount));
        $revenue = $food + $rooms;
        $gross = $revenue - $cogs;

        return [
            'from' => $from,
            'to' => $to,
            'revenue' => ['total' => Money::toRupees($revenue), 'restaurant' => Money::toRupees($food), 'rooms' => Money::toRupees($rooms)],
            'food_cost' => Money::toRupees($cogs),
            'food_cost_percent' => $food > 0 ? round($cogs / $food * 100, 1) : null,
            'gross_profit' => Money::toRupees($gross),
            'expenses' => [
                'total' => Money::toRupees($exp),
                'by_category' => $expenses->groupBy('category')->map(fn ($rows, $k) => ['category' => $k, 'amount' => Money::toRupees((int) $rows->sum(fn ($e) => Money::toPaise($e->amount)))])->sortByDesc(fn ($r) => (float) $r['amount'])->values(),
            ],
            'net_profit' => Money::toRupees($gross - $exp),
            'margin_percent' => $revenue > 0 ? round(($gross - $exp) / $revenue * 100, 1) : null,
            'series' => array_values(array_map(fn ($d) => ['date' => $d['date'], 'revenue' => Money::toRupees($d['revenue']), 'food_cost' => Money::toRupees($d['food_cost']), 'expenses' => Money::toRupees($d['expenses']), 'profit' => Money::toRupees($d['revenue'] - $d['food_cost'] - $d['expenses'])], $days)),
            // Honest about gaps: dishes without a recipe add no food cost.
            'coverage' => [
                'dishes' => MenuItem::count(),
                'with_recipe' => Recipe::distinct('menu_item_id')->count('menu_item_id'),
                'ingredients_without_cost' => InventoryItem::whereNull('cost_per_unit')->count(),
            ],
        ];
    }

    /** Each dish (and size) with its recipe cost, price before GST, food cost % and margin. */
    public function dishCosts(): array
    {
        $recipes = Recipe::all()->groupBy(fn ($r) => $r->menu_item_id.'|'.($r->item_variant_id ?? 0));
        $costs = InventoryItem::pluck('cost_per_unit', 'id');
        $inclusive = app(OrderingSettings::class)->get()['prices_include_tax'];
        $out = [];
        foreach (MenuItem::with(['variants', 'category'])->orderBy('name')->get() as $dish) {
            $sizes = $dish->variants->isEmpty() ? [null] : $dish->variants->all();
            foreach ($sizes as $v) {
                $lines = $recipes[$dish->id.'|'.($v->id ?? 0)] ?? $recipes[$dish->id.'|0'] ?? collect();
                $missing = $lines->filter(fn ($l) => ($costs[$l->inventory_item_id] ?? null) === null)->count();
                $cost = (int) $lines->sum(fn ($l) => ($costs[$l->inventory_item_id] ?? null) === null ? 0 : round((float) $l->quantity * Money::toPaise($costs[$l->inventory_item_id])));
                $price = Money::toPaise($v->price ?? $dish->price);
                // Prices may include GST: compare cost with the price before GST.
                $rate = (float) ($dish->tax_rate ?? $dish->category?->tax_rate ?? 5);
                $net = $inclusive ? (int) round($price * 100 / (100 + $rate)) : $price;
                $out[] = [
                    'id' => $dish->id,
                    'name' => $dish->name,
                    'size' => $v?->name,
                    'category' => $dish->category?->name,
                    'price' => Money::toRupees($net),
                    'cost' => $lines->isEmpty() ? null : Money::toRupees($cost),
                    'food_cost_percent' => $lines->isEmpty() || $net === 0 ? null : round($cost / $net * 100, 1),
                    'margin' => $lines->isEmpty() ? null : Money::toRupees($net - $cost),
                    'missing_costs' => $missing,
                ];
            }
        }

        return $out;
    }
}
