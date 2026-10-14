<?php

namespace Tests\Feature\Growth;

use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Inventory\Notifications\LowStockForStaff;
use App\Modules\Loyalty\Models\GiftCard;
use App\Modules\Plans\Models\Plan;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

class GiftCardsAndInventoryTest extends OperationsTestCase
{
    public function test_gift_cards_are_sold_spent_on_bills_and_counted_at_day_end(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $card = $this->actingAsUser($owner)->postJson('/api/v1/tenant/loyalty/gift-cards', ['value' => 500, 'mode' => 'cash', 'issued_to' => 'Priya'])
            ->assertCreated()->assertJsonPath('data.balance', '500.00')->json('data');
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/', $card['code']);
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/loyalty/gift-cards/lookup?code='.strtolower(str_replace('-', '', $card['code'])))->assertOk()->assertJsonPath('data.balance', '500.00');

        $bill = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$this->posOrder([$this->naan(2)])->json('data.id')]])->json('data.id'); // ₹136
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$bill}/pay", ['payments' => [['mode' => 'gift_card', 'amount' => 136]]])->assertStatus(422);
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$bill}/pay", ['payments' => [['mode' => 'gift_card', 'amount' => 136, 'reference' => $card['code']]]])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->assertSame('364.00', $this->asTenant(fn () => GiftCard::find($card['id'])->balance));

        // More than the balance → refused; expired / cancelled cards don't work.
        $big = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$this->posOrder([$this->naan(8)])->json('data.id')]])->json('data');
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$big['id']}/pay", ['payments' => [['mode' => 'gift_card', 'amount' => $big['total'], 'reference' => $card['code']]]])
            ->assertStatus(422)->assertJsonPath('meta.code', 'gift_card_balance');
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/loyalty/gift-cards/{$card['id']}/void", ['reason' => 'Lost card'])->assertOk()->assertJsonPath('data.status', 'void');
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/loyalty/gift-cards/lookup?code='.$card['code'])->assertStatus(422);

        // Day-end: the ₹500 cash for the card is in the drawer; the gift card payment is its own mode.
        $r = $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/reports/day?date=2026-11-10')->assertOk();
        $r->assertJsonPath('data.cash.gift_cards', '500.00')->assertJsonPath('data.gift_cards_sold.0.mode', 'cash')->assertJsonPath('data.cash.expected', '500.00');
        $this->assertSame('136.00', collect($r->json('data.payments'))->firstWhere('mode', 'gift_card')['amount']);
    }

    public function test_recipes_deduct_stock_when_cooked_and_put_it_back_when_cancelled(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);
        $flour = $this->actingAsUser($owner)->postJson('/api/v1/tenant/inventory/items', ['name' => 'Maida', 'unit' => 'kg', 'stock' => 1, 'low_stock_level' => 0.5, 'cost_per_unit' => 40])
            ->assertCreated()->assertJsonPath('data.stock', '1.000')->json('data.id');
        $butter = $this->actingAsUser($owner)->postJson('/api/v1/tenant/inventory/items', ['name' => 'Butter', 'unit' => 'g', 'stock' => 1000])->json('data.id');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/inventory/items', ['name' => 'maida', 'unit' => 'kg'])->assertStatus(422);

        // Naan: 0.1 kg maida + 10 g butter. Dal: Full uses 30 g butter, any other size 15 g.
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/inventory/recipes/{$this->items['naan']->id}", ['lines' => [
            ['inventory_item_id' => $flour, 'quantity' => 0.1], ['inventory_item_id' => $butter, 'quantity' => 10],
        ]])->assertOk();
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/inventory/recipes/{$this->items['dal']->id}", ['lines' => [
            ['inventory_item_id' => $butter, 'quantity' => 15],
            ['inventory_item_id' => $butter, 'item_variant_id' => $this->variant('Full'), 'quantity' => 30],
        ]])->assertOk();
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/inventory/recipes')->assertOk();

        // 3 naan + 1 Full dal + 1 Half dal reach the kitchen.
        $this->posOrder([$this->naan(3), ['item_id' => $this->items['dal']->id, 'variant_id' => $this->variant('Full'), 'quantity' => 1], ['item_id' => $this->items['dal']->id, 'variant_id' => $this->variant('Half'), 'quantity' => 1]])->assertCreated();
        $this->assertSame(['0.700', '925.000'], $this->asTenant(fn () => [InventoryItem::find($flour)->stock, InventoryItem::find($butter)->stock]));

        // 3 more naan: maida 0.4 kg ≤ 0.5 → one low-stock alert.
        $orderId = $this->posOrder([$this->naan(3)])->json('data.id');
        $this->assertSame('0.400', $this->asTenant(fn () => InventoryItem::find($flour)->stock));
        Notification::assertSentTo([$owner], LowStockForStaff::class);
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/inventory/items')->assertJsonPath('data.low', 1);

        // Cancelled → back in stock.
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => 'cancelled', 'note' => 'Wrong table'])->assertOk();
        $this->assertSame('0.700', $this->asTenant(fn () => InventoryItem::find($flour)->stock));

        // Purchase, wastage and a physical count.
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/inventory/items/{$flour}/stock", ['type' => 'purchase', 'quantity' => 5, 'unit_cost' => 42])->assertOk()->assertJsonPath('data.stock', '5.700')->assertJsonPath('data.cost_per_unit', '42.00');
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/inventory/items/{$flour}/stock", ['type' => 'wastage', 'quantity' => 0.2, 'note' => 'Spilt'])->assertJsonPath('data.stock', '5.500');
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/inventory/items/{$flour}/stock", ['type' => 'count', 'quantity' => 5.25])->assertJsonPath('data.stock', '5.250');
        $types = collect($this->actingAsUser($owner)->getJson("/api/v1/tenant/inventory/items/{$flour}/movements")->json('data'))->pluck('type')->all();
        $this->assertSame(['adjust', 'wastage', 'purchase', 'return', 'sale', 'sale', 'adjust'], $types);
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/inventory/items/{$flour}")->assertStatus(422)->assertJsonPath('meta.code', 'in_use');

        // Inventory is a Growth feature; waiters can't manage it.
        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->getJson('/api/v1/tenant/inventory/items')->assertForbidden();
        $this->tenant->update(['plan_id' => Plan::where('code', 'starter')->value('id')]);
        $this->app->forgetScopedInstances();
        $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/inventory/items')->assertForbidden();
    }
}
