<?php

namespace Tests\Feature\Growth;

use App\Modules\Inventory\Models\InventoryItem;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/** Suppliers and purchase orders: suggested from low stock, sent, received into stock. */
class PurchasingTest extends OperationsTestCase
{
    public function test_a_purchase_order_is_suggested_sent_and_received_into_stock(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);
        $api = $this->actingAsUser($owner);
        $flour = $api->postJson('/api/v1/tenant/inventory/items', ['name' => 'Maida', 'unit' => 'kg', 'stock' => 1, 'low_stock_level' => 5, 'cost_per_unit' => 40])->assertCreated()->json('data.id');
        $api->postJson('/api/v1/tenant/inventory/items', ['name' => 'Salt', 'unit' => 'kg', 'stock' => 10, 'low_stock_level' => 1])->assertCreated();

        $api->postJson('/api/v1/tenant/inventory/suppliers', ['name' => 'X', 'gstin' => 'bad'])->assertStatus(422);
        $supplier = $api->postJson('/api/v1/tenant/inventory/suppliers', ['name' => 'Sharma Traders', 'phone' => '98765 43210', 'gstin' => '27aapfu0939f1zv'])
            ->assertCreated()->json('data.id');
        $this->assertSame('27AAPFU0939F1ZV', $api->getJson('/api/v1/tenant/inventory/suppliers')->json('data.0.gstin'));

        // Only the low item is suggested, topped up to twice its level.
        $suggest = $api->getJson('/api/v1/tenant/inventory/purchase-orders/suggestions')->assertOk()->json('data');
        $this->assertSame(['Maida'], array_column($suggest, 'name'));
        $this->assertEquals(9, $suggest[0]['quantity']);

        $po = $api->postJson('/api/v1/tenant/inventory/purchase-orders', ['supplier_id' => $supplier, 'lines' => [['inventory_item_id' => $flour, 'quantity' => 9, 'unit_cost' => 40]]])
            ->assertCreated()->assertJsonPath('data.code', 'PO-0001')->assertJsonPath('data.status', 'draft')->json('data');
        $this->assertEquals(360, $po['total']);
        $this->assertStringContainsString('Maida: 9 kg', $po['message']);

        $api->postJson("/api/v1/tenant/inventory/purchase-orders/{$po['id']}/send")->assertOk()->assertJsonPath('data.status', 'sent');
        $api->putJson("/api/v1/tenant/inventory/purchase-orders/{$po['id']}", ['supplier_id' => $supplier, 'lines' => [['inventory_item_id' => $flour, 'quantity' => 1]]])
            ->assertStatus(422)->assertJsonPath('meta.code', 'not_draft');

        // 8 kg arrived at ₹42: stock and cost follow what was actually received.
        $line = $po['lines'][0]['id'];
        $api->postJson("/api/v1/tenant/inventory/purchase-orders/{$po['id']}/receive", ['lines' => [['id' => $line, 'received' => 8, 'unit_cost' => 42]]])
            ->assertOk()->assertJsonPath('data.status', 'received');
        $item = $this->asTenant(fn () => InventoryItem::find($flour));
        $this->assertEquals(9, (float) $item->stock);
        $this->assertEquals(42, (float) $item->cost_per_unit);
        $api->postJson("/api/v1/tenant/inventory/purchase-orders/{$po['id']}/receive")->assertStatus(422)->assertJsonPath('meta.code', 'closed');
        $this->assertEquals(336, $api->getJson('/api/v1/tenant/inventory/purchase-orders')->json('data.0.total'));

        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->getJson('/api/v1/tenant/inventory/suppliers')->assertForbidden();
    }
}
