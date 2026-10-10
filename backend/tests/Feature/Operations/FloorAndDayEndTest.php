<?php

namespace Tests\Feature\Operations;

use App\Modules\Ordering\Models\Order;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableSession;

/** Floor plan (layout, transfer, merge, cleaning) and the day-end report. */
class FloorAndDayEndTest extends OperationsTestCase
{
    public function test_floor_plan_layout_transfer_merge_and_cleaning(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $t1 = $this->table('T1');
        $t2 = $this->table('T2');
        $this->actingAsUser($owner)->putJson('/api/v1/tenant/tables/layout', ['tables' => [
            ['id' => $t1, 'x' => 40, 'y' => 60, 'shape' => 'round'],
            ['id' => $t2, 'x' => 240, 'y' => 60, 'shape' => 'square'],
        ]])->assertOk();
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/tables/live')->assertJsonPath('data.tables.0.pos_x', 40)->assertJsonPath('data.tables.0.shape', 'round');

        $this->posOrder([$this->naan()], 'dine_in', 'T1')->assertCreated();
        $s1 = $this->asTenant(fn () => TableSession::where('dining_table_id', $t1)->where('status', 'open')->value('id'));
        $waiter = $this->staff($this->tenant, 'waiter');

        // Guests move from T1 to T2: their bill goes with them, T1 needs cleaning.
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/sessions/{$s1}/transfer", ['table_id' => $t2])->assertOk();
        $this->assertSame('T2', $this->asTenant(fn () => Order::value('table_label')));
        $live = collect($this->actingAsUser($waiter)->getJson('/api/v1/tenant/tables/live')->json('data.tables'))->keyBy('label');
        $this->assertSame(['cleaning', 'occupied'], [$live['T1']['state'], $live['T2']['state']]);

        // New guests at T1 (it gets used again), then the two tables merge into one bill.
        $this->posOrder([$this->lassi()], 'dine_in', 'T1')->assertCreated();
        $s1b = $this->asTenant(fn () => TableSession::where('dining_table_id', $t1)->where('status', 'open')->value('id'));
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/sessions/{$s1}/transfer", ['table_id' => $t1])->assertStatus(422)->assertJsonPath('meta.code', 'table_in_use');
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/sessions/{$s1}/merge", ['session_id' => $s1b])->assertOk();
        $this->assertSame(2, $this->asTenant(fn () => Order::where('table_session_id', $s1)->count()));
        $this->assertSame('closed', $this->asTenant(fn () => TableSession::find($s1b)->status));

        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/{$t1}/clean")->assertOk();
        $this->assertNull($this->asTenant(fn () => DiningTable::find($t1)->cleaning_since));
        $this->actingAsUser($waiter)->putJson('/api/v1/tenant/tables/layout', ['tables' => []])->assertForbidden(); // layout is set-up
    }

    public function test_day_end_report_and_closing(): void
    {
        // Two POS bills (cash 136, UPI 63) and one website order paid on collection without a bill.
        $a = $this->posOrder([$this->naan(2)])->json('data.id');
        $bill = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$a]])->json('data.id');
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$bill}/pay", ['payments' => [['mode' => 'cash', 'amount' => 136]]])->assertOk();
        $b = $this->posOrder([$this->naan()])->json('data.id');
        $bill2 = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$b]])->json('data.id');
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$bill2}/pay", ['payments' => [['mode' => 'upi', 'amount' => 73]]])->assertOk();

        $this->app['auth']->forgetGuards();
        $web = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated()->json('data.order.id');
        $webId = $this->asTenant(fn () => Order::where('public_id', $web)->value('id'));
        $owner = $this->ownerOf($this->tenant);
        foreach (['confirmed', 'preparing', 'ready', 'completed'] as $s) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$webId}/status", ['status' => $s])->assertOk();
        }
        $webTotal = $this->asTenant(fn () => Order::find($webId)->total);

        $r = $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/reports/day?date=2026-11-10&opening_cash=500')->assertOk();
        $r->assertJsonPath('data.bills.count', 2)->assertJsonPath('data.bills.first', 'INV/2026-27/0001')->assertJsonPath('data.bills.total', '209.00')
            ->assertJsonPath('data.orders.count', 3)->assertJsonPath('data.outside_bills.0.method', 'counter')->assertJsonPath('data.outside_bills.0.amount', $webTotal)
            ->assertJsonPath('data.top_items.0.name', 'Butter Naan')->assertJsonPath('data.top_items.0.quantity', 6);
        $modes = collect($r->json('data.payments'))->keyBy('mode');
        $this->assertSame(['136.00', '73.00'], [$modes['cash']['amount'], $modes['upi']['amount']]);
        $expected = number_format(500 + 136 + (float) $webTotal, 2, '.', '');
        $r->assertJsonPath('data.cash.expected', $expected);

        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/reports/day/close', ['date' => '2026-11-10', 'opening_cash' => 500, 'counted_cash' => 1000, 'notes' => 'Counted twice'])
            ->assertOk()->assertJsonPath('data.closing.counted_cash', '1000.00')->assertJsonPath('data.closing.difference', number_format(1000 - (float) $expected, 2, '.', ''));
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $this->tenant->id, 'action' => 'day.closed']);
        $this->actingAsUser($this->cashier)->get('/api/v1/tenant/reports/day/pdf?date=2026-11-10')->assertOk()->assertHeader('content-type', 'application/pdf');
    }
}
