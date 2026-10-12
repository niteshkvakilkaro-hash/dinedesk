<?php

namespace Tests\Feature\Operations;

/** GST for the month (GSTR-1 sections) and Tally vouchers. Today is 10 Nov 2026; Naan ₹60 at 5%, Lassi ₹99.99 at 18%. */
class GstReportTest extends OperationsTestCase
{
    private function paidBill(int $orderId, array $extra = []): int
    {
        $bill = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$orderId]] + $extra)->assertCreated()->json('data');
        $this->postJson("/api/v1/tenant/bills/{$bill['id']}/pay", ['payments' => [['mode' => 'cash', 'amount' => (float) $bill['total']]]])->assertOk();

        return $bill['id'];
    }

    public function test_month_sections_include_bills_and_orders_paid_without_a_bill(): void
    {
        $this->tenant->update(['gstin' => '27AAPFU0939F1ZV']);
        $this->paidBill($this->posOrder([$this->naan(2)])->json('data.id'));
        $this->paidBill($this->posOrder([$this->lassi()])->json('data.id'), ['buyer' => ['name' => 'Acme Pvt Ltd', 'gstin' => '29ABCDE1234F1Z5']]);
        // A website order paid at the counter that never got a bill.
        $web = $this->orderPayload();
        $web['items'] = [['item_id' => $this->items['naan']->id, 'quantity' => 3]];
        $this->postJson('/api/v1/site/orders', $web, $this->site())->assertCreated();
        // A voided bill whose order was then cancelled: listed as cancelled, not in the totals.
        $extra = $this->posOrder([$this->naan(5)])->json('data.id');
        $voided = $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$extra]])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/tenant/bills/{$voided}/void", ['reason' => 'Wrong table'])->assertOk();
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson("/api/v1/tenant/orders/{$extra}/status", ['status' => 'cancelled', 'note' => 'Guest left'])->assertOk();

        $owner = $this->ownerOf($this->tenant);
        $r = $this->actingAsUser($owner)->getJson('/api/v1/tenant/reports/gst?month=2026-11')->assertOk()->json('data');
        $this->assertSame('27', $r['state_code']);
        $this->assertSame(1, $r['unbilled']['orders']);
        $this->assertSame(1, $r['bills']['b2b']);
        $this->assertSame('29ABCDE1234F1Z5', $r['b2b'][0]['gstin']);
        $this->assertSame(18.0, (float) $r['b2b'][0]['rate']);
        $five = collect($r['b2cs'])->firstWhere('rate', 5);
        $this->assertSame('300.00', $five['taxable']); // ₹120 billed + ₹180 unbilled
        $this->assertSame('7.50', $five['cgst']);
        $this->assertSame(['996331'], collect($r['hsn'])->pluck('sac')->unique()->values()->all());
        $this->assertSame(1, $r['docs'][0]['cancelled']);
        $this->assertSame(3, $r['docs'][0]['total']);

        $csv = $this->get('/api/v1/tenant/reports/gst/export/b2b?month=2026-11')->assertOk()->streamedContent();
        $this->assertStringContainsString('29ABCDE1234F1Z5', $csv);

        // Tally: every voucher balances to zero; unbilled orders come as one voucher for the day.
        $xml = simplexml_load_string($this->get('/api/v1/tenant/reports/gst/export/tally?month=2026-11')->assertOk()->streamedContent());
        $vouchers = $xml->xpath('//VOUCHER');
        $this->assertCount(3, $vouchers);
        foreach ($vouchers as $v) {
            $sum = array_sum(array_map(fn ($a) => (float) $a, $v->xpath('.//AMOUNT')));
            $this->assertEqualsWithDelta(0, $sum, 0.001, (string) $v->VOUCHERNUMBER);
        }
        $this->assertContains('WEB-20261110', array_map(fn ($v) => (string) $v->VOUCHERNUMBER, $vouchers));
        $this->assertContains('Acme Pvt Ltd', array_map(fn ($v) => (string) $v->PARTYLEDGERNAME, $vouchers));
    }

    public function test_only_people_who_see_reports(): void
    {
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/reports/gst')->assertForbidden();
        $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/reports/gst?month=nope')->assertStatus(422);
        $this->getJson('/api/v1/tenant/reports/gst/export/other')->assertNotFound();
    }
}
