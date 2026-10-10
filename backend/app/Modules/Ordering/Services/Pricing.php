<?php

namespace App\Modules\Ordering\Services;

use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Support\Money;
use App\Support\ApiException;
use Illuminate\Support\Collection;

/**
 * The only place an order's money is worked out. The browser sends item ids,
 * variant ids, add-on ids and quantities, never prices; everything below is
 * read from the menu in the current tenant's context.
 *
 * Tax: each line uses item GST → category GST → business default. Prices are
 * tax-exclusive unless the business says its menu prices include GST.
 * Packaging and delivery fees are shown separately and not taxed here.
 */
class Pricing
{
    public const MAX_LINES = 50;

    public const MAX_QTY = 50;

    public function __construct(private readonly OrderingSettings $settings) {}

    public static function lineRules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:'.self::MAX_LINES],
            'items.*.item_id' => ['required', 'integer'],
            'items.*.variant_id' => ['nullable', 'integer'],
            'items.*.addon_ids' => ['nullable', 'array', 'max:20'],
            'items.*.addon_ids.*' => ['integer', 'distinct'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:'.self::MAX_QTY],
            'items.*.notes' => ['nullable', 'string', 'max:200'],
        ];
    }

    /**
     * @param  array<int, array{item_id: int, variant_id?: ?int, addon_ids?: ?array, quantity: int, notes?: ?string}>  $lines
     */
    public function quote(string $type, array $lines, ?DeliveryZone $zone = null): array
    {
        $settings = $this->settings->get();
        $inclusive = (bool) $settings['prices_include_tax'];
        $defaultRate = Money::rateBp($settings['default_tax_rate']);

        $items = MenuItem::with(['category', 'variants', 'addonGroups.addons'])
            ->whereIn('id', collect($lines)->pluck('item_id')->unique())
            ->get()
            ->keyBy('id');

        $out = [];
        $subtotal = $tax = $gross = 0;

        foreach ($lines as $i => $line) {
            $item = $items->get($line['item_id']);
            if (! $item || ! $item->category?->is_active) {
                $this->fail($i, 'One of the dishes in your cart is no longer on the menu.', 'item_missing');
            }
            if (! $item->is_available) {
                $this->fail($i, "{$item->name} is not available right now.", 'item_unavailable');
            }

            [$base, $variantName, $variantId] = $this->basePrice($item, $line['variant_id'] ?? null, $i);
            $addons = $this->addons($item, $line['addon_ids'] ?? [], $i);
            $unit = $base + array_sum(array_column($addons, 'paise'));
            $qty = (int) $line['quantity'];
            $lineGross = $unit * $qty;

            $rateBp = $item->tax_rate !== null ? Money::rateBp($item->tax_rate)
                : ($item->category->tax_rate !== null ? Money::rateBp($item->category->tax_rate) : $defaultRate);

            if ($inclusive) {
                $lineTax = Money::taxWithin($lineGross, $rateBp);
                $lineSub = $lineGross - $lineTax;
                $lineTotal = $lineGross;
            } else {
                $lineTax = Money::taxOnTop($lineGross, $rateBp);
                $lineSub = $lineGross;
                $lineTotal = $lineGross + $lineTax;
            }

            $subtotal += $lineSub;
            $tax += $lineTax;
            $gross += $lineTotal;

            $out[] = [
                'menu_item_id' => $item->id,
                'name' => $item->name,
                'name_hi' => $item->name_hi,
                'item_variant_id' => $variantId,
                'variant_name' => $variantName,
                'addons' => array_map(fn ($a) => ['id' => $a['id'], 'name' => $a['name'], 'price' => Money::toRupees($a['paise'])], $addons),
                'food_type' => $item->food_type,
                'unit_price' => Money::toRupees($unit),
                'quantity' => $qty,
                'tax_rate' => Money::toRupees($rateBp),
                'line_subtotal' => Money::toRupees($lineSub),
                'line_tax' => Money::toRupees($lineTax),
                'line_total' => Money::toRupees($lineTotal),
                'notes' => isset($line['notes']) && $line['notes'] !== '' ? strip_tags($line['notes']) : null,
            ];
        }

        $packaging = in_array($type, ['delivery', 'takeaway'], true) ? Money::toPaise($settings['packaging_fee']) : 0;
        $delivery = 0;
        if ($type === 'delivery' && $zone) {
            $min = Money::toPaise($zone->min_order);
            if ($gross < $min) {
                throw new ApiException(
                    'The minimum order for delivery to your area is ₹'.Money::toRupees($min).'.',
                    422,
                    'below_minimum',
                    ['min_order' => Money::toRupees($min), 'items_total' => Money::toRupees($gross)],
                );
            }
            $freeAbove = $zone->free_above !== null ? Money::toPaise($zone->free_above) : null;
            $delivery = $freeAbove !== null && $gross >= $freeAbove ? 0 : Money::toPaise($zone->fee);
        }

        return [
            'lines' => $out,
            'subtotal' => Money::toRupees($subtotal),
            'tax_total' => Money::toRupees($tax),
            // Intra-state supply: GST splits equally into CGST and SGST.
            'cgst' => Money::toRupees(intdiv($tax, 2) + $tax % 2),
            'sgst' => Money::toRupees(intdiv($tax, 2)),
            'items_total' => Money::toRupees($gross),
            'packaging_fee' => Money::toRupees($packaging),
            'delivery_fee' => Money::toRupees($delivery),
            'total' => Money::toRupees($gross + $packaging + $delivery),
            'prices_include_tax' => $inclusive,
            'zone' => $zone ? [
                'id' => $zone->id,
                'name' => $zone->name,
                'fee' => $zone->fee,
                'min_order' => $zone->min_order,
                'free_above' => $zone->free_above,
            ] : null,
        ];
    }

    /** @return array{0: int, 1: ?string, 2: ?int} */
    private function basePrice(MenuItem $item, ?int $variantId, int $i): array
    {
        /** @var Collection $variants */
        $variants = $item->variants;
        if ($variants->isEmpty()) {
            if ($variantId) {
                $this->fail($i, "Please choose the options for {$item->name} again.", 'invalid_variant');
            }

            return [Money::toPaise($item->price), null, null];
        }
        $variant = $variants->firstWhere('id', $variantId);
        if (! $variant) {
            $this->fail($i, "Please choose a size/portion for {$item->name}.", 'variant_required');
        }
        if (! $variant->is_available) {
            $this->fail($i, "{$item->name} ({$variant->name}) is not available right now.", 'item_unavailable');
        }

        return [Money::toPaise($variant->price), $variant->name, $variant->id];
    }

    /** @return list<array{id: int, name: string, paise: int}> */
    private function addons(MenuItem $item, array $addonIds, int $i): array
    {
        $chosen = [];
        $remaining = array_map('intval', $addonIds);
        foreach ($item->addonGroups as $group) {
            $picked = $group->addons->filter(fn ($a) => in_array($a->id, $remaining, true));
            $remaining = array_values(array_diff($remaining, $picked->pluck('id')->all()));
            $count = $picked->count();
            if ($count < $group->min_select) {
                $this->fail($i, "Please choose {$group->min_select} from \"{$group->name}\" for {$item->name}.", 'addons_required');
            }
            if ($group->max_select !== null && $count > $group->max_select) {
                $this->fail($i, "Choose at most {$group->max_select} from \"{$group->name}\" for {$item->name}.", 'addons_too_many');
            }
            foreach ($picked as $addon) {
                if (! $addon->is_available) {
                    $this->fail($i, "{$addon->name} is not available right now.", 'addon_unavailable');
                }
                $chosen[] = ['id' => $addon->id, 'name' => $addon->name, 'paise' => Money::toPaise($addon->price)];
            }
        }
        if ($remaining) {
            $this->fail($i, "Please choose the extras for {$item->name} again.", 'invalid_addon');
        }

        return $chosen;
    }

    /**
     * Takes a discount (coupon, loyalty points) off a quote before GST: shared across the lines
     * in proportion to their taxable value, GST worked out again per line, totals rebuilt.
     */
    public function applyDiscount(array $quote, int $offPaise, ?string $label): array
    {
        $taxable = array_map(fn ($l) => Money::toPaise($l['line_subtotal']), $quote['lines']);
        $offPaise = min($offPaise, array_sum($taxable));
        if ($offPaise <= 0) {
            return $quote + ['discount_total' => '0.00', 'discount_label' => null];
        }
        $shares = \App\Modules\Billing\Services\Billing::share($offPaise, $taxable);
        $subtotal = $tax = $gross = 0;
        foreach ($quote['lines'] as $i => &$l) {
            $lineTaxable = $taxable[$i] - $shares[$i];
            $lineTax = $shares[$i] === 0 ? Money::toPaise($l['line_tax']) : Money::taxOnTop($lineTaxable, Money::rateBp($l['tax_rate']));
            $l['line_discount'] = Money::toRupees($shares[$i]);
            $l['line_subtotal'] = Money::toRupees($lineTaxable);
            $l['line_tax'] = Money::toRupees($lineTax);
            $l['line_total'] = Money::toRupees($lineTaxable + $lineTax);
            $subtotal += $lineTaxable;
            $tax += $lineTax;
            $gross += $lineTaxable + $lineTax;
        }
        unset($l);
        $fees = Money::toPaise($quote['packaging_fee']) + Money::toPaise($quote['delivery_fee']);

        return array_merge($quote, [
            'subtotal' => Money::toRupees($subtotal),
            'tax_total' => Money::toRupees($tax),
            'cgst' => Money::toRupees(intdiv($tax, 2) + $tax % 2),
            'sgst' => Money::toRupees(intdiv($tax, 2)),
            'items_total' => Money::toRupees($gross),
            'total' => Money::toRupees($gross + $fees),
            'discount_total' => Money::toRupees($offPaise),
            'discount_label' => $label,
        ]);
    }

    private function fail(int $line, string $message, string $code): never
    {
        throw new ApiException($message, 422, $code, ['line' => $line]);
    }
}
