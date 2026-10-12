<?php

namespace Tests\Feature\Operations;

use App\Modules\Kitchen\Models\Kot;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Ordering\Models\Order;

/** Kitchen stations: one ticket per station; the order is ready when every station is. */
class KitchenStationsTest extends OperationsTestCase
{
    public function test_an_order_splits_by_station_and_is_ready_when_all_are(): void
    {
        $this->asTenant(fn () => MenuCategory::where('name', 'Drinks')->update(['station' => 'Bar']));
        $orderId = $this->posOrder([$this->naan(2), $this->lassi()])->assertCreated()->json('data.id');

        $kots = $this->asTenant(fn () => Kot::with('items')->where('order_id', $orderId)->orderBy('number')->get());
        $this->assertSame([null, 'Bar'], $kots->pluck('station')->all());
        $this->assertSame(['Butter Naan'], $kots[0]->items->pluck('name')->all());
        $this->assertSame(['Lassi'], $kots[1]->items->pluck('name')->all());

        $owner = $this->ownerOf($this->tenant);
        $board = $this->actingAsUser($owner)->getJson('/api/v1/tenant/kitchen/tickets')->assertOk()->json('data');
        $this->assertSame(['Bar'], $board['stations']);

        // The kitchen is ready, the bar isn't yet: the order is still being prepared.
        $this->postJson("/api/v1/tenant/kitchen/tickets/{$kots[0]->id}/status", ['status' => 'ready'])->assertOk();
        $this->assertSame('preparing', $this->asTenant(fn () => Order::find($orderId)->status));
        $this->postJson("/api/v1/tenant/kitchen/tickets/{$kots[1]->id}/status", ['status' => 'ready'])->assertOk();
        $this->assertSame('ready', $this->asTenant(fn () => Order::find($orderId)->status));

        // Completing the order serves both tickets.
        $this->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => 'completed'])->assertOk();
        $this->assertSame(['served', 'served'], $this->asTenant(fn () => Kot::where('order_id', $orderId)->orderBy('number')->pluck('status')->all()));
    }

    public function test_the_station_is_set_on_the_menu_section(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $id = $this->asTenant(fn () => MenuCategory::where('name', 'Mains')->value('id'));
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/menu/categories/{$id}", ['name' => 'Mains', 'station' => ' Tandoor ', 'is_active' => true])->assertOk();
        $this->assertSame('Tandoor', $this->asTenant(fn () => MenuCategory::find($id)->station));
    }
}
