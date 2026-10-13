<?php

namespace Tests\Feature\Operations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Models\Order;

/** Swiggy / Zomato orders entered at the POS: kitchen, GST bill, paid through the app, commission in the P&L. */
class AppOrdersTest extends OperationsTestCase
{
    public function test_an_app_order_is_billed_paid_through_the_app_and_its_commission_counted(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $order = ['channel' => 'swiggy', 'channel_ref' => 'SW-55021', 'customer' => ['name' => 'Swiggy guest'], 'items' => [$this->naan(2)]];

        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/pos/app-orders', $order)->assertStatus(422)->assertJsonPath('meta.code', 'app_off');

        $settings = $this->actingAsUser($owner)->getJson('/api/v1/tenant/ordering')->json('data.settings');
        $this->putJson('/api/v1/tenant/ordering', ['apps' => ['swiggy' => ['enabled' => true, 'commission' => 25], 'zomato' => ['enabled' => false, 'commission' => 20]]] + $settings)
            ->assertOk()->assertJsonPath('data.settings.apps.swiggy.commission', 25);

        $this->actingAsUser($this->cashier);
        $this->assertSame(['swiggy'], $this->getJson('/api/v1/tenant/pos/offline-pack')->json('data.apps'));
        $res = $this->postJson('/api/v1/tenant/pos/app-orders', $order)->assertCreated()->json('data');
        $this->assertSame('30.00', $res['commission']); // 25% of ₹120 food value before GST

        $saved = $this->asTenant(fn () => Order::findOrFail($res['id']));
        $this->assertSame(['swiggy', 'SW-55021', 'completed'], [$saved->channel, $saved->channel_ref, $saved->status]);
        $bill = $this->asTenant(fn () => Invoice::where('number', $res['bill'])->with('payments')->firstOrFail());
        $this->assertSame('paid', $bill->status);
        $this->assertSame([['app', $bill->total, 'Swiggy SW-55021']], $bill->payments->map(fn ($p) => [$p->mode, $p->amount, $p->reference])->all());

        // Entered twice by mistake: refused.
        $this->postJson('/api/v1/tenant/pos/app-orders', $order)->assertStatus(422)->assertJsonPath('meta.code', 'app_duplicate');
        $this->postJson('/api/v1/tenant/pos/app-orders', ['channel' => 'zomato'] + $order)->assertStatus(422)->assertJsonPath('meta.code', 'app_off');

        // Profit and loss: the app's sales, and its commission as an expense.
        $pnl = $this->actingAsUser($owner)->getJson('/api/v1/tenant/finance/pnl')->assertOk()->json('data');
        $this->assertSame([['app' => 'swiggy', 'sales' => number_format((float) $saved->total - (float) $saved->tax_total, 2, '.', '')]], $pnl['apps']);
        $this->assertSame('30.00', collect($pnl['expenses']['by_category'])->firstWhere('category', 'app_commission')['amount']);

        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->postJson('/api/v1/tenant/pos/app-orders', $order)->assertForbidden();
    }
}
