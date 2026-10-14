<?php

namespace Tests\Feature\Operations;

use App\Modules\Kitchen\Models\Kot;
use App\Modules\Ordering\Models\Order;
use App\Modules\Plans\Models\Plan;

/** Kitchen tickets follow orders, and orders follow the Kitchen Display. */
class KitchenTest extends OperationsTestCase
{
    public function test_orders_reach_the_kitchen_and_move_together(): void
    {
        $kitchen = $this->staff($this->tenant, 'kitchen');

        // Website pay-later order → ticket straight away.
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $board = $this->actingAsUser($kitchen)->getJson('/api/v1/tenant/kitchen/tickets')->assertOk();
        $board->assertJsonCount(1, 'data.tickets')->assertJsonPath('data.tickets.0.status', 'new')->assertJsonPath('data.tickets.0.number', 1)
            ->assertJsonPath('data.tickets.0.items.0.name', 'Dal Makhani')->assertJsonPath('data.tickets.0.items.0.variant_name', 'Full')
            ->assertJsonPath('data.tickets.0.items.0.addons', 'Extra butter');
        $id = $board->json('data.tickets.0.id');
        $orderId = $board->json('data.tickets.0.order_id');

        // Start cooking: the pending order is accepted and marked preparing.
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/tickets/{$id}/status", ['status' => 'preparing'])->assertOk()->assertJsonPath('data.status', 'preparing');
        $this->assertSame('preparing', $this->asTenant(fn () => Order::find($orderId)->status));
        $item = $board->json('data.tickets.0.items.0.id');
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/items/{$item}/toggle")->assertJsonPath('data.done', true);

        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/tickets/{$id}/status", ['status' => 'ready'])->assertOk();
        $this->assertSame('ready', $this->asTenant(fn () => Order::find($orderId)->status));
        // Bump off the screen, then recall a mistaken bump.
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/tickets/{$id}/status", ['status' => 'served'])->assertOk();
        $this->actingAsUser($kitchen)->getJson('/api/v1/tenant/kitchen/tickets')->assertJsonCount(0, 'data.tickets')->assertJsonCount(1, 'data.served');
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/tickets/{$id}/status", ['status' => 'ready'])->assertOk();
        $this->actingAsUser($kitchen)->postJson("/api/v1/tenant/kitchen/tickets/{$id}/status", ['status' => 'preparing'])->assertStatus(422);
    }

    public function test_the_orders_board_moves_the_ticket_and_cancelling_removes_it(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $orderId = $this->asTenant(fn () => Order::value('id'));
        foreach (['confirmed', 'preparing'] as $s) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => $s])->assertOk();
        }
        $this->assertSame('preparing', $this->asTenant(fn () => Kot::value('status')));
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => 'cancelled', 'note' => 'Out of stock'])->assertOk();
        $this->assertSame('cancelled', $this->asTenant(fn () => Kot::value('status')));
    }

    public function test_staff_orders_go_straight_to_the_kitchen(): void
    {
        $this->posOrder([$this->naan(2)])->assertCreated();
        $this->posOrder([$this->naan()], 'dine_in')->assertStatus(422); // a table is needed for dine-in
        $order = $this->asTenant(fn () => Order::first());
        $this->assertSame(['confirmed', 'pos', 'counter'], [$order->status, $order->source, $order->payment_method]);
        $this->assertSame(1, $this->asTenant(fn () => Kot::count()));

        // Waiters send table orders; numbers keep running.
        $waiter = $this->staff($this->tenant, 'waiter');
        $this->actingAsUser($waiter)->postJson('/api/v1/tenant/pos/orders', ['type' => 'dine_in', 'source' => 'waiter', 'dining_table_id' => $this->table('T1'), 'items' => [$this->lassi()]])
            ->assertCreated()->assertJsonPath('data.number', 1002);
        $this->assertSame('T1', $this->asTenant(fn () => Kot::orderByDesc('id')->value('table_label')));
    }

    public function test_kitchen_access_follows_roles_and_plan(): void
    {
        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->getJson('/api/v1/tenant/kitchen/tickets')->assertForbidden();
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->postJson('/api/v1/tenant/pos/orders', ['type' => 'takeaway', 'source' => 'pos', 'items' => [$this->naan()]])->assertForbidden();
        $this->actingAsUser($this->staff($this->tenant, 'manager'))->getJson('/api/v1/tenant/kitchen/tickets')->assertOk();

        $this->tenant->update(['plan_id' => Plan::where('code', 'starter')->value('id')]);
        $this->app->forgetScopedInstances();
        $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/kitchen/tickets')->assertForbidden();
    }
}
