<?php

namespace Tests\Feature\Operations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Kitchen\Models\Kot;
use App\Modules\Ordering\Models\Order;

/** Offline POS: sales saved on the device become orders, GST bills and payments once, when back online. */
class OfflinePosTest extends OperationsTestCase
{
    private function sale(string $ref, array $items, array $payments, string $at = '-10 minutes'): array
    {
        return ['ref' => $ref, 'at' => now()->modify($at)->toIso8601String(), 'items' => $items, 'payments' => $payments, 'customer' => ['name' => 'Ravi', 'phone' => '98765 43210']];
    }

    public function test_offline_sales_sync_once_with_bill_and_payment(): void
    {
        $this->actingAsUser($this->cashier);
        $pack = $this->getJson('/api/v1/tenant/pos/offline-pack')->assertOk()->json('data');
        $this->assertSame(500, $pack['rates'][$this->items['naan']->id]);
        $this->assertSame(1800, $pack['rates'][$this->items['lassi']->id]);

        $res = $this->postJson('/api/v1/tenant/pos/offline-sync', ['sales' => [
            $this->sale('dev1-0001', [$this->naan(2), $this->lassi()], [['mode' => 'upi', 'amount' => 100], ['mode' => 'cash', 'amount' => 200]]),
            $this->sale('dev1-0002', [['item_id' => 999999, 'quantity' => 1]], [['mode' => 'cash', 'amount' => 50]]),
            $this->sale('dev1-0003', [$this->naan()], [['mode' => 'cash', 'amount' => 1]]),
            ['ref' => 'bad ref!', 'at' => 'x'],
        ]])->assertOk()->json('data.results');

        $this->assertSame(['synced', 'failed', 'needs_attention', 'failed'], array_column($res, 'status'));
        $this->assertStringContainsString('no longer on the menu', $res[1]['message']);

        // The synced sale: order completed, kitchen ticket served, bill paid (UPI first, change from cash).
        $order = $this->asTenant(fn () => Order::where('client_ref', 'dev1-0001')->firstOrFail());
        $this->assertSame('completed', $order->status);
        $this->assertSame('Ravi', $order->customer_name);
        $this->assertTrue($order->placed_at->lt(now()->subMinutes(5)));
        $this->assertSame(['served'], $this->asTenant(fn () => Kot::where('order_id', $order->id)->pluck('status')->all()));
        $bill = $this->asTenant(fn () => Invoice::where('number', $res[0]['bill'])->with('payments')->firstOrFail());
        $this->assertSame('paid', $bill->status);
        $this->assertSame(['upi' => '100.00', 'cash' => number_format((float) $bill->total - 100, 2, '.', '')], $bill->payments->pluck('amount', 'mode')->all());

        // Short payment: the bill waits in Open bills for the cashier.
        $this->assertSame('unpaid', $this->asTenant(fn () => Invoice::where('number', $res[2]['bill'])->value('status')));

        // Sent again (lost response): saved once.
        $again = $this->postJson('/api/v1/tenant/pos/offline-sync', ['sales' => [$this->sale('dev1-0001', [$this->naan(2)], [['mode' => 'cash', 'amount' => 500]])]])->json('data.results.0');
        $this->assertSame(['duplicate', $res[0]['bill']], [$again['status'], $again['bill']]);
        $this->assertSame(1, $this->asTenant(fn () => Order::where('client_ref', 'dev1-0001')->count()));
    }

    public function test_a_clock_far_off_is_not_trusted_and_waiters_cannot_sync(): void
    {
        $this->actingAsUser($this->cashier);
        $this->postJson('/api/v1/tenant/pos/offline-sync', ['sales' => [$this->sale('dev1-0100', [$this->naan()], [['mode' => 'cash', 'amount' => 500]], '-9 days')]])
            ->assertJsonPath('data.results.0.status', 'synced');
        $this->assertTrue($this->asTenant(fn () => Order::where('client_ref', 'dev1-0100')->value('placed_at'))->gt(now()->subMinutes(5)));

        $this->actingAsUser($this->staff($this->tenant, 'waiter'));
        $this->postJson('/api/v1/tenant/pos/offline-sync', ['sales' => [$this->sale('dev1-0101', [$this->naan()], [['mode' => 'cash', 'amount' => 500]])]])->assertForbidden();
    }
}
