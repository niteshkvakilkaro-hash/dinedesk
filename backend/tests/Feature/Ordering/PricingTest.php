<?php

namespace Tests\Feature\Ordering;

use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Support\Money;

class PricingTest extends OrderingTestCase
{
    public function test_money_helpers_round_half_up_in_paise(): void
    {
        $this->assertSame(1230, Money::toPaise('12.30'));
        $this->assertSame(9999, Money::toPaise(99.99));
        $this->assertSame('0.05', Money::toRupees(5));
        $this->assertSame(500, Money::taxOnTop(9999, 500));        // 4.9995 → 5.00
        $this->assertSame(476, Money::taxWithin(10000, 500));      // 100 incl. 5% → 4.76
        $this->assertSame(1, Money::divRound(1, 2));
    }

    public function test_quote_uses_variant_addons_and_tax_per_line(): void
    {
        $res = $this->postJson('/api/v1/site/orders/quote', [
            'type' => 'takeaway',
            'items' => [
                ['item_id' => $this->items['dal']->id, 'variant_id' => $this->variant('Full'), 'addon_ids' => [$this->addon('Extra butter'), $this->addon('Raita')], 'quantity' => 2],
                ['item_id' => $this->items['lassi']->id, 'quantity' => 3],
            ],
        ], $this->site())->assertOk();

        // Dal: (260 + 20 + 70) × 2 = 700.00, GST 5% (business default) = 35.00
        $res->assertJsonPath('data.lines.0.unit_price', '350.00')
            ->assertJsonPath('data.lines.0.variant_name', 'Full')
            ->assertJsonPath('data.lines.0.line_tax', '35.00')
            ->assertJsonPath('data.lines.0.tax_rate', '5.00');
        // Lassi: 99.99 × 3 = 299.97, GST 18% from its category = 53.9946 → 53.99
        $res->assertJsonPath('data.lines.1.tax_rate', '18.00')->assertJsonPath('data.lines.1.line_tax', '53.99');
        $res->assertJsonPath('data.subtotal', '999.97')
            ->assertJsonPath('data.tax_total', '88.99')
            ->assertJsonPath('data.cgst', '44.50')
            ->assertJsonPath('data.sgst', '44.49')
            ->assertJsonPath('data.packaging_fee', '10.00')
            ->assertJsonPath('data.total', '1098.96');
    }

    public function test_prices_that_include_gst(): void
    {
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['prices_include_tax'] = true;
            $s['packaging_fee'] = 0;
            app(OrderingSettings::class)->save($s);
        });
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 1]]], $this->site())
            ->assertOk()
            ->assertJsonPath('data.lines.0.line_total', '60.00')
            ->assertJsonPath('data.lines.0.line_tax', '2.86')   // 60 × 5/105
            ->assertJsonPath('data.subtotal', '57.14')
            ->assertJsonPath('data.total', '60.00');
    }

    public function test_client_cannot_choose_prices_or_break_option_rules(): void
    {
        $quote = fn (array $line) => $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'items' => [$line]], $this->site());

        // Unknown fields like price are simply ignored.
        $quote(['item_id' => $this->items['naan']->id, 'quantity' => 1, 'price' => 1, 'unit_price' => 1])->assertJsonPath('data.lines.0.unit_price', '60.00');

        $quote(['item_id' => $this->items['dal']->id, 'quantity' => 1])->assertStatus(422)->assertJsonPath('meta.code', 'variant_required');
        $quote(['item_id' => $this->items['soldout']->id, 'quantity' => 1])->assertStatus(422)->assertJsonPath('meta.code', 'item_unavailable');
        $quote(['item_id' => $this->items['dal']->id, 'variant_id' => $this->variant('Half'), 'addon_ids' => [$this->addon('Extra butter'), $this->addon('Raita'), $this->addon('Papad')], 'quantity' => 1])
            ->assertStatus(422)->assertJsonPath('meta.code', 'addons_too_many');
        // An add-on that doesn't belong to the dish.
        $quote(['item_id' => $this->items['naan']->id, 'addon_ids' => [$this->addon('Raita')], 'quantity' => 1])->assertStatus(422)->assertJsonPath('meta.code', 'invalid_addon');
        $quote(['item_id' => $this->items['naan']->id, 'quantity' => 51])->assertStatus(422);
        $quote(['item_id' => 999999, 'quantity' => 1])->assertStatus(422)->assertJsonPath('meta.code', 'item_missing');
    }

    public function test_delivery_zone_fee_minimum_and_free_delivery(): void
    {
        $quote = fn (array $extra, int $naans) => $this->postJson('/api/v1/site/orders/quote', ['type' => 'delivery', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => $naans]]] + $extra, $this->site());

        // Pincode zone: min ₹200 on the items total (incl. GST), ₹30 fee, free above ₹800.
        $quote(['pincode' => '411038'], 2)->assertOk()->assertJsonPath('data.zone_error.code', 'below_minimum');
        $quote(['pincode' => '411038'], 4)->assertOk()->assertJsonPath('data.zone.name', 'Kothrud')->assertJsonPath('data.delivery_fee', '30.00')->assertJsonPath('data.zone_error', null);
        $quote(['pincode' => '411038'], 13)->assertOk()->assertJsonPath('data.delivery_fee', '0.00');

        // Radius zone by distance from the restaurant (≈2.4 km away).
        $quote(['pincode' => '411001', 'lat' => 18.5309, 'lng' => 73.8778], 6)->assertOk()->assertJsonPath('data.zone.name', '5 km')->assertJsonPath('data.delivery_fee', '50.00');
        // Out of range.
        $quote(['pincode' => '400001', 'lat' => 19.07, 'lng' => 72.87], 6)->assertOk()->assertJsonPath('data.zone_error.code', 'outside_delivery_area');
    }
}
