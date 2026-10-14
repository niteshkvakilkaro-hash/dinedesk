<?php

namespace Tests\Feature\Operations;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\Billing;
use App\Modules\Ordering\Models\Order;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableSession;
use Carbon\CarbonImmutable;
use Illuminate\Testing\TestResponse;

/** GST bills: numbering, discounts, GST, round-off, split payments, tables, voids. */
class BillingTest extends OperationsTestCase
{
    private function bill(array $body): TestResponse
    {
        return $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', $body);
    }

    private function pay(int $id, array $payments): TestResponse
    {
        return $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$id}/pay", ['payments' => $payments]);
    }

    public function test_takeaway_bill_with_cash_change_and_numbering(): void
    {
        $orderId = $this->posOrder([$this->naan(2)])->json('data.id');
        // 2 × ₹60 = ₹120 + 5% GST ₹6 + packaging ₹10 = ₹136; no GSTIN yet → a Bill.
        $bill = $this->bill(['order_ids' => [$orderId]])->assertCreated()
            ->assertJsonPath('data.number', 'INV/2026-27/0001')->assertJsonPath('data.kind', 'bill')
            ->assertJsonPath('data.taxable_value', '120.00')->assertJsonPath('data.cgst', '3.00')->assertJsonPath('data.sgst', '3.00')
            ->assertJsonPath('data.charges', '10.00')->assertJsonPath('data.total', '136.00')->assertJsonPath('data.due', '136.00')
            ->assertJsonPath('data.lines.0.sac', '996331')->assertJsonPath('data.amount_in_words', 'Rupees One Hundred Thirty-Six Only');
        $id = $bill->json('data.id');

        $this->bill(['order_ids' => [$orderId]])->assertStatus(422)->assertJsonPath('meta.code', 'already_billed');
        $this->pay($id, [['mode' => 'cash', 'amount' => 100]])->assertStatus(422)->assertJsonPath('meta.code', 'short_payment');
        // ₹200 cash: ₹64 change; only ₹136 is recorded.
        $this->pay($id, [['mode' => 'cash', 'amount' => 200]])->assertOk()->assertJsonPath('data.status', 'paid')->assertJsonPath('data.payments.0.amount', '136.00');
        $this->pay($id, [['mode' => 'cash', 'amount' => 1]])->assertStatus(422)->assertJsonPath('meta.code', 'not_payable');
        $order = $this->asTenant(fn () => Order::find($orderId));
        $this->assertSame(['completed', 'paid'], [$order->status, $order->payment_status]);

        $next = $this->posOrder([$this->naan()])->json('data.id');
        $this->bill(['order_ids' => [$next]])->assertJsonPath('data.number', 'INV/2026-27/0002');

        // A new financial year starts again at 0001.
        $this->travelTo(CarbonImmutable::parse('2027-04-01 12:00', 'Asia/Kolkata'));
        $later = $this->posOrder([$this->naan()])->json('data.id');
        $this->bill(['order_ids' => [$later]])->assertJsonPath('data.number', 'INV/2027-28/0001');
    }

    public function test_discount_is_taken_before_gst_with_a_reason_and_round_off(): void
    {
        $orderId = $this->posOrder([$this->naan(2)])->json('data.id');
        $this->bill(['order_ids' => [$orderId], 'discount' => ['type' => 'percent', 'value' => 10]])->assertStatus(422)->assertJsonPath('meta.code', 'reason_required');
        // 10% off ₹120 = ₹12 → taxable ₹108, GST ₹5.40, + ₹10 = ₹123.40 → ₹123 (round off −0.40).
        $this->bill(['order_ids' => [$orderId], 'discount' => ['type' => 'percent', 'value' => 10, 'reason' => 'Regular guest']])->assertCreated()
            ->assertJsonPath('data.discount', '12.00')->assertJsonPath('data.taxable_value', '108.00')->assertJsonPath('data.cgst', '2.70')
            ->assertJsonPath('data.round_off', '-0.40')->assertJsonPath('data.total', '123.00')->assertJsonPath('data.discount_reason', 'Regular guest');
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $this->tenant->id, 'action' => 'bill.discount']);

        // Mixed GST rates: the discount is shared in proportion and each line taxed at its own rate.
        $mixed = $this->posOrder([$this->naan(), $this->lassi()])->json('data.id');
        $b = $this->bill(['order_ids' => [$mixed], 'discount' => ['type' => 'amount', 'value' => 16, 'reason' => 'Complaint']])->assertCreated();
        $lines = $b->json('data.lines');
        $this->assertSame('16.00', number_format((float) $lines[0]['discount'] + (float) $lines[1]['discount'], 2));
        $this->assertSame(['5.00', '18.00'], [$lines[0]['tax_rate'], $lines[1]['tax_rate']]);
        $gross = (float) $b->json('data.taxable_value') + (float) $b->json('data.cgst') + (float) $b->json('data.sgst') + (float) $b->json('data.charges');
        $this->assertEqualsWithDelta(round($gross), (float) $b->json('data.total'), 0.001);

        $this->bill(['order_ids' => [$this->posOrder([$this->naan()])->json('data.id')], 'discount' => ['type' => 'amount', 'value' => 999, 'reason' => 'x']])
            ->assertStatus(422)->assertJsonPath('meta.code', 'discount_too_large');
    }

    public function test_split_payments_and_tax_invoice_with_buyer_gstin(): void
    {
        $this->tenant->update(['gstin' => '27AAPFU0939F1ZV']);
        $orderId = $this->posOrder([$this->naan(5)])->json('data.id'); // 300 + 15 + 10 = 325
        $this->bill(['order_ids' => [$orderId], 'buyer' => ['gstin' => 'BAD']])->assertStatus(422);
        $id = $this->bill(['order_ids' => [$orderId], 'buyer' => ['name' => 'Acme Pvt Ltd', 'gstin' => '29abcde1234f1z5']])->assertCreated()
            ->assertJsonPath('data.kind', 'tax_invoice')->assertJsonPath('data.seller.gstin', '27AAPFU0939F1ZV')->assertJsonPath('data.buyer.gstin', '29ABCDE1234F1Z5')
            ->assertJsonPath('data.total', '325.00')->json('data.id');

        $this->pay($id, [['mode' => 'upi', 'amount' => 400]])->assertStatus(422)->assertJsonPath('meta.code', 'overpaid');
        $this->pay($id, [['mode' => 'upi', 'amount' => 200, 'reference' => 'UTR123'], ['mode' => 'card', 'amount' => 125]])->assertOk()
            ->assertJsonPath('data.status', 'paid')->assertJsonCount(2, 'data.payments');

        $pdf = $this->actingAsUser($this->cashier)->get("/api/v1/tenant/bills/{$id}/pdf");
        $pdf->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $pdf->getContent());
    }

    public function test_table_bill_closes_the_table_and_void_reopens_billing(): void
    {
        $this->posOrder([$this->naan(2)], 'dine_in', 'T1')->assertCreated();
        $this->posOrder([$this->lassi()], 'dine_in', 'T1')->assertCreated();
        $session = $this->asTenant(fn () => TableSession::where('status', 'open')->value('id'));
        $open = $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/pos/open')->assertOk()->assertJsonPath('data.tables.0.table', 'T1')->assertJsonPath('data.tables.0.orders', 2);

        // Dine-in has no packaging: 120 + 6 + 99.99 + 18.00 = 243.99 → 244.
        $id = $this->bill(['session_id' => $session])->assertCreated()->assertJsonPath('data.total', '244.00')->assertJsonPath('data.round_off', '0.01')->json('data.id');
        $this->bill(['session_id' => $session])->assertStatus(422);
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$id}/void", ['reason' => 'Wrong items'])->assertOk()->assertJsonPath('data.status', 'void');
        $id = $this->bill(['session_id' => $session, 'discount' => ['type' => 'amount', 'value' => 20, 'reason' => 'Birthday']])->assertCreated()->json('data.id');
        $this->pay($id, [['mode' => 'card', 'amount' => $this->asTenant(fn () => Invoice::find($id)->total)]])->assertOk();

        $this->assertSame('closed', $this->asTenant(fn () => TableSession::find($session)->status));
        $this->assertNotNull($this->asTenant(fn () => DiningTable::where('label', 'T1')->value('cleaning_since')));
        $this->assertSame(2, $this->asTenant(fn () => Order::where('status', 'completed')->where('payment_status', 'paid')->count()));
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/bills/{$id}/void", ['reason' => 'x x'])->assertStatus(422);
    }

    public function test_bills_are_private_and_need_the_pos_permission(): void
    {
        $id = $this->bill(['order_ids' => [$this->posOrder([$this->naan()])->json('data.id')]])->json('data.id');
        $other = $this->business('Other Place', 'growth', ['status' => 'live']);
        $this->actingAsUser($this->ownerOf($other))->getJson("/api/v1/tenant/bills/{$id}")->assertNotFound();
        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->getJson("/api/v1/tenant/bills/{$id}")->assertForbidden();
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/pos/open')->assertForbidden();
    }

    public function test_discount_shares_add_up_to_the_paisa(): void
    {
        $this->assertSame([34, 33, 33], Billing::share(100, [1, 1, 1]));
        $this->assertSame([0, 0], Billing::share(0, [5, 5]));
        $this->assertSame(1001, array_sum(Billing::share(1001, [12000, 9999, 1])));
    }
}
