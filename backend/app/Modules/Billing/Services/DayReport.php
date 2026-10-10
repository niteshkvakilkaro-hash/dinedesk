<?php

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Models\BillPayment;
use App\Modules\Billing\Models\DayClosing;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderItem;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Day-end report for one business day (business timezone), from real records only:
 *  - bills issued that day (GST, discounts, round-off) and money received by mode
 *  - every order placed that day by type and channel, cancellations, top dishes
 *  - orders paid outside a bill (website cash-on-delivery / counter orders that were
 *    completed without a POS bill), shown separately
 *  - what is still open (tables, unbilled orders), and the cash expected in the drawer
 */
class DayReport
{
    public function build(Tenant $tenant, string $date, float $openingCash = 0): array
    {
        $tz = $tenant->timezone;
        $from = CarbonImmutable::createFromFormat('Y-m-d H:i', "{$date} 00:00", $tz)->utc();
        $to = $from->addDay();

        $invoices = Invoice::whereDate('business_date', $date)->where('status', '!=', 'void')->get();
        $voided = Invoice::whereDate('business_date', $date)->where('status', 'void')->count();
        $sum = fn ($rows, string $field) => Money::toRupees($rows->sum(fn ($r) => Money::toPaise($r->{$field})));

        $payments = BillPayment::whereDate('business_date', $date)->get()->groupBy('mode')
            ->map(fn ($rows, $mode) => ['mode' => $mode, 'count' => $rows->count(), 'amount' => $sum($rows, 'amount')])->values();

        $orders = Order::where('placed_at', '>=', $from)->where('placed_at', '<', $to)->get();
        $live = $orders->filter(fn (Order $o) => $o->status !== 'cancelled' && ! ($o->payment_method === 'online' && $o->payment_status !== 'paid'));
        $cancelled = $orders->where('status', 'cancelled');

        // Paid orders with no bill (e.g. website orders paid on delivery and completed on the Orders board).
        $billedIds = DB::table('invoice_order')->join('invoices', 'invoices.id', '=', 'invoice_order.invoice_id')
            ->where('invoices.status', '!=', 'void')->whereIn('invoice_order.order_id', $live->pluck('id'))->pluck('invoice_order.order_id');
        $unbilledPaid = $live->whereNotIn('id', $billedIds)->where('payment_status', 'paid');
        $outside = $unbilledPaid->groupBy('payment_method')->map(fn ($rows, $m) => ['method' => $m, 'count' => $rows->count(), 'amount' => $sum($rows, 'total')])->values();

        $top = OrderItem::query()->whereIn('order_id', $live->pluck('id'))
            ->select('name', DB::raw('SUM(quantity) as qty'), DB::raw('SUM(line_total) as amount'))
            ->groupBy('name')->orderByDesc('qty')->limit(10)->get()
            ->map(fn ($r) => ['name' => $r->name, 'quantity' => (int) $r->qty, 'amount' => Money::toRupees(Money::toPaise($r->amount))]);

        $cashBills = Money::toPaise($payments->firstWhere('mode', 'cash')['amount'] ?? 0);
        $cashOutside = (int) $unbilledPaid->whereIn('payment_method', ['cod', 'counter'])->sum(fn ($o) => Money::toPaise($o->total));
        $expected = Money::toPaise($openingCash) + $cashBills + $cashOutside;

        return [
            'date' => $date,
            'business' => ['name' => $tenant->name, 'gstin' => $tenant->gstin],
            'bills' => [
                'count' => $invoices->count(),
                'first' => $invoices->sortBy('sequence')->first()?->number,
                'last' => $invoices->sortBy('sequence')->last()?->number,
                'voided' => $voided,
                'items_total' => $sum($invoices, 'items_total'),
                'discount' => $sum($invoices, 'discount'),
                'taxable_value' => $sum($invoices, 'taxable_value'),
                'cgst' => $sum($invoices, 'cgst'),
                'sgst' => $sum($invoices, 'sgst'),
                'charges' => $sum($invoices, 'charges'),
                'round_off' => $sum($invoices, 'round_off'),
                'total' => $sum($invoices, 'total'),
                'unpaid' => $invoices->where('status', 'unpaid')->count(),
            ],
            'payments' => $payments,
            'outside_bills' => $outside,
            'orders' => [
                'count' => $live->count(),
                'value' => $sum($live, 'total'),
                'by_type' => $live->groupBy('type')->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count(), 'amount' => $sum($r, 'total')])->values(),
                'by_source' => $live->groupBy('source')->map(fn ($r, $k) => ['key' => $k, 'count' => $r->count(), 'amount' => $sum($r, 'total')])->values(),
                'cancelled' => ['count' => $cancelled->count(), 'amount' => $sum($cancelled, 'total')],
                'average' => $live->count() ? Money::toRupees(intdiv($live->sum(fn ($o) => Money::toPaise($o->total)), $live->count())) : '0.00',
            ],
            'top_items' => $top,
            'open' => [
                'tables' => TableSession::where('status', 'open')->count(),
                'unbilled_orders' => Order::whereNull('table_session_id')->where('payment_status', 'unpaid')->whereNotIn('status', ['cancelled'])
                    ->where('placed_at', '>=', $from)->where('placed_at', '<', $to)->whereNotIn('id', DB::table('invoice_order')->select('order_id'))->count(),
                'unpaid_bills' => Invoice::where('status', 'unpaid')->count(),
            ],
            'cash' => [
                'opening' => Money::toRupees(Money::toPaise($openingCash)),
                'from_bills' => Money::toRupees($cashBills),
                'outside_bills' => Money::toRupees($cashOutside),
                'expected' => Money::toRupees($expected),
            ],
            'closing' => ($c = DayClosing::whereDate('business_date', $date)->first()) ? [
                'opening_cash' => $c->opening_cash, 'counted_cash' => $c->counted_cash, 'expected_cash' => $c->expected_cash,
                'difference' => $c->difference, 'notes' => $c->notes, 'closed_at' => $c->updated_at->toIso8601String(),
            ] : null,
        ];
    }

    /** Close the day: keep the figures as they were and the cash count. Closing again updates it. */
    public function close(Tenant $tenant, string $date, float $opening, float $counted, ?string $notes, int $userId): DayClosing
    {
        $report = $this->build($tenant, $date, $opening);
        $expected = Money::toPaise($report['cash']['expected']);

        return DayClosing::updateOrCreate(['business_date' => $date], [
            'opening_cash' => Money::toRupees(Money::toPaise($opening)),
            'expected_cash' => Money::toRupees($expected),
            'counted_cash' => Money::toRupees(Money::toPaise($counted)),
            'difference' => Money::toRupees(Money::toPaise($counted) - $expected),
            'notes' => $notes ? strip_tags($notes) : null,
            'summary' => $report,
            'closed_by' => $userId,
        ]);
    }
}
