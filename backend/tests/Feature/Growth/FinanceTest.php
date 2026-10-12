<?php

namespace Tests\Feature\Growth;

use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Support\Money;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/** Profit and loss: revenue without GST, food cost from recipes at cost price, recorded expenses. */
class FinanceTest extends OperationsTestCase
{
    public function test_profit_and_loss_and_dish_costs(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);
        $flour = $this->actingAsUser($owner)->postJson('/api/v1/tenant/inventory/items', ['name' => 'Maida', 'unit' => 'kg', 'stock' => 10, 'cost_per_unit' => 40])->json('data.id');
        $butter = $this->postJson('/api/v1/tenant/inventory/items', ['name' => 'Butter', 'unit' => 'g', 'stock' => 1000])->json('data.id'); // no cost entered
        $this->putJson("/api/v1/tenant/inventory/recipes/{$this->items['naan']->id}", ['lines' => [['inventory_item_id' => $flour, 'quantity' => 0.1]]])->assertOk();
        $this->putJson("/api/v1/tenant/inventory/recipes/{$this->items['dal']->id}", ['lines' => [['inventory_item_id' => $butter, 'quantity' => 15]]])->assertOk();

        $this->posOrder([$this->naan(3)])->assertCreated();
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/finance/expenses', ['date' => '2026-11-10', 'category' => 'rent', 'amount' => 1000, 'payment_mode' => 'bank', 'note' => 'November rent'])->assertCreated();
        $this->postJson('/api/v1/tenant/finance/expenses', ['date' => '2026-11-10', 'category' => 'party', 'amount' => 10, 'payment_mode' => 'cash'])->assertStatus(422);

        $sales = $this->asTenant(fn () => Order::all()->sum(fn ($o) => Money::toPaise($o->total) - Money::toPaise($o->tax_total)));
        $r = $this->getJson('/api/v1/tenant/finance/pnl?from=2026-11-01&to=2026-11-10')->assertOk()->json('data');
        $this->assertSame(Money::toRupees($sales), $r['revenue']['restaurant']);
        $this->assertSame('12.00', $r['food_cost']); // 3 × 0.1 kg × ₹40
        $this->assertSame('1000.00', $r['expenses']['total']);
        $this->assertSame('rent', $r['expenses']['by_category'][0]['category']);
        $this->assertSame(Money::toRupees($sales - 1200 - 100000), $r['net_profit']);
        $this->assertSame(1, $r['coverage']['ingredients_without_cost']);
        $this->assertCount(10, $r['series']);

        $costs = collect($this->getJson('/api/v1/tenant/finance/dish-costs')->assertOk()->json('data'));
        $naan = $costs->firstWhere('name', 'Butter Naan');
        $this->assertSame('4.00', $naan['cost']);
        $this->assertEqualsWithDelta(6.7, $naan['food_cost_percent'], 0.05);
        $this->assertSame(1, $costs->firstWhere('name', 'Dal Makhani')['missing_costs']);
        $this->assertNull($costs->firstWhere('name', 'Lassi')['cost']); // no recipe

        $list = $this->getJson('/api/v1/tenant/finance/expenses?month=2026-11')->assertOk()->json('data');
        $this->deleteJson("/api/v1/tenant/finance/expenses/{$list[0]['id']}")->assertOk();
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/finance/pnl')->assertForbidden();
    }
}
