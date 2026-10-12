<?php

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderItem;
use App\Modules\Ordering\Support\Money;
use App\Modules\Reports\Services\Analytics;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * A month's outward supplies in the shape of GSTR-1 (B2B, B2CS, HSN/SAC summary, documents
 * issued) from the GST bills, plus the orders paid without a bill (website, online), which
 * carry GST too. Everything restaurants and hotels sell here is intra-state (CGST + SGST).
 * For the CA to check and file; DineDesk doesn't file returns.
 */
class GstReport
{
    public function __construct(private readonly Analytics $analytics) {}

    /** @return array<string, mixed> */
    public function month(Tenant $tenant, string $month): array
    {
        $from = CarbonImmutable::createFromFormat('Y-m-d', "{$month}-01", $tenant->timezone)->startOfMonth();
        $to = $from->endOfMonth();
        $invoices = Invoice::with('lines')->whereBetween('business_date', [$from->format('Y-m-d'), $to->format('Y-m-d')])->orderBy('financial_year')->orderBy('sequence')->get();
        $valid = $invoices->where('status', '!=', 'void');
        $state = $this->stateCode($tenant->gstin);

        // B2B: bills to a registered buyer (their GSTIN on the bill).
        $b2b = $valid->filter(fn (Invoice $i) => ! empty($i->buyer['gstin']))->flatMap(fn (Invoice $i) => $i->lines->groupBy(fn ($l) => (string) (float) $l->tax_rate)->map(fn ($lines, $rate) => [
            'gstin' => strtoupper($i->buyer['gstin']),
            'name' => $i->buyer['name'] ?? '',
            'number' => $i->number,
            'date' => $i->business_date->format('d-m-Y'),
            'value' => $i->total,
            'place_of_supply' => $state,
            'rate' => (float) $rate,
            'taxable' => $this->sum($lines, 'taxable_value'),
            'cgst' => $this->sum($lines, 'cgst'),
            'sgst' => $this->sum($lines, 'sgst'),
        ])->values())->values();

        // B2C (small): everything else by rate, bills and unbilled orders together.
        $b2cLines = $valid->filter(fn (Invoice $i) => empty($i->buyer['gstin']))->flatMap(fn (Invoice $i) => $i->lines)
            ->map(fn ($l) => ['rate' => (float) $l->tax_rate, 'sac' => $l->sac, 'qty' => (int) $l->quantity, 'taxable' => Money::toPaise($l->taxable_value), 'tax' => Money::toPaise($l->cgst) + Money::toPaise($l->sgst), 'cgst' => Money::toPaise($l->cgst), 'sgst' => Money::toPaise($l->sgst)]);
        $unbilled = $this->unbilledLines($tenant, $from, $to);
        $allB2c = $b2cLines->concat($unbilled['lines']);
        $b2cs = $allB2c->groupBy('rate')->map(fn ($rows, $rate) => [
            'place_of_supply' => $state,
            'rate' => (float) $rate,
            'taxable' => Money::toRupees((int) $rows->sum('taxable')),
            'cgst' => Money::toRupees((int) $rows->sum('cgst')),
            'sgst' => Money::toRupees((int) $rows->sum('sgst')),
        ])->sortBy('rate')->values();

        // HSN / SAC summary (restaurant service 996331, rooms 996311 ...).
        $b2bLines = $valid->filter(fn (Invoice $i) => ! empty($i->buyer['gstin']))->flatMap(fn (Invoice $i) => $i->lines)
            ->map(fn ($l) => ['rate' => (float) $l->tax_rate, 'sac' => $l->sac, 'qty' => (int) $l->quantity, 'taxable' => Money::toPaise($l->taxable_value), 'cgst' => Money::toPaise($l->cgst), 'sgst' => Money::toPaise($l->sgst)]);
        $hsn = $allB2c->concat($b2bLines)->groupBy(fn ($r) => $r['sac'].'|'.$r['rate'])->map(fn ($rows) => [
            'sac' => $rows->first()['sac'],
            'rate' => $rows->first()['rate'],
            'quantity' => (int) $rows->sum('qty'),
            'taxable' => Money::toRupees((int) $rows->sum('taxable')),
            'cgst' => Money::toRupees((int) $rows->sum('cgst')),
            'sgst' => Money::toRupees((int) $rows->sum('sgst')),
            'total' => Money::toRupees((int) $rows->sum('taxable') + (int) $rows->sum('cgst') + (int) $rows->sum('sgst')),
        ])->sortBy('sac')->values();

        // Documents issued: each bill series, with cancelled (void) bills.
        $docs = $invoices->groupBy(fn (Invoice $i) => preg_replace('/\d+$/', '', $i->number))->map(fn ($rows, $prefix) => [
            'series' => $prefix,
            'from' => $rows->first()->number,
            'to' => $rows->last()->number,
            'total' => $rows->count(),
            'cancelled' => $rows->where('status', 'void')->count(),
        ])->values();

        $taxable = (int) $allB2c->sum('taxable') + (int) $b2bLines->sum('taxable');
        $cgst = (int) $allB2c->sum('cgst') + (int) $b2bLines->sum('cgst');
        $sgst = (int) $allB2c->sum('sgst') + (int) $b2bLines->sum('sgst');

        return [
            'month' => $month,
            'gstin' => $tenant->gstin,
            'state_code' => $state,
            'totals' => ['taxable' => Money::toRupees($taxable), 'cgst' => Money::toRupees($cgst), 'sgst' => Money::toRupees($sgst), 'tax' => Money::toRupees($cgst + $sgst)],
            'bills' => ['count' => $valid->count(), 'void' => $invoices->where('status', 'void')->count(), 'b2b' => $b2b->pluck('number')->unique()->count()],
            'unbilled' => ['orders' => $unbilled['orders'], 'taxable' => Money::toRupees((int) $unbilled['lines']->sum('taxable')), 'tax' => Money::toRupees((int) $unbilled['lines']->sum('tax'))],
            'b2b' => $b2b,
            'b2cs' => $b2cs,
            'hsn' => $hsn,
            'docs' => $docs,
            'invoices' => $valid->values(),
        ];
    }

    /** Orders that count as sales but were never put on a bill (room service is billed with the stay). */
    private function unbilledLines(Tenant $tenant, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $billed = DB::table('invoice_order')->join('invoices', 'invoices.id', '=', 'invoice_order.invoice_id')->where('invoices.status', '!=', 'void')->pluck('invoice_order.order_id')->all();
        $orders = $this->analytics->orders($tenant, $from->format('Y-m-d'), $to->format('Y-m-d'))
            ->filter(fn (Order $o) => Analytics::counts($o) && $o->type !== 'room_service' && ! in_array($o->id, $billed, true));
        $lines = OrderItem::whereIn('order_id', $orders->pluck('id'))->get()->map(function ($l) {
            $tax = Money::toPaise($l->line_tax);
            $cgst = intdiv($tax, 2);

            return ['rate' => (float) $l->tax_rate, 'sac' => '996331', 'qty' => (int) $l->quantity, 'taxable' => Money::toPaise($l->line_subtotal), 'tax' => $tax, 'cgst' => $cgst, 'sgst' => $tax - $cgst];
        });

        return ['orders' => $orders->count(), 'lines' => $lines];
    }

    private function sum($rows, string $field): string
    {
        return Money::toRupees((int) $rows->sum(fn ($r) => Money::toPaise($r->{$field})));
    }

    /** First two digits of a GSTIN are the state code (e.g. 08 Rajasthan). */
    private function stateCode(?string $gstin): ?string
    {
        return $gstin && preg_match('/^\d{2}/', $gstin) ? substr($gstin, 0, 2) : null;
    }
}
