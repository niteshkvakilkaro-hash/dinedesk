<?php

namespace App\Modules\Billing\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\BillPayment;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\InvoiceLine;
use App\Modules\Kitchen\Services\Kitchen;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Support\Money;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableRequest;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Services\SiteContent;
use App\Support\ApiException;
use App\Support\Realtime\Live;
use App\Modules\Crm\Services\CustomerActivity;
use App\Modules\Loyalty\Services\GiftCards;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Marketing\Services\Coupons;
use App\Modules\Ordering\Models\Customer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Bills and GST invoices.
 *
 * One invoice per bill: a single order (takeaway, delivery, POS) or everything a table
 * ordered. Lines are the orders' own lines (prices were fixed when ordered). A bill
 * discount is taken off the taxable value, shared across lines in proportion, and GST
 * is worked out again on what is left (CGST + SGST, intra-state). The total is rounded
 * to the rupee with a round-off line. Numbers run per business per Indian financial
 * year: INV/2026-27/0001. With a GSTIN the document is a Tax invoice, without one a Bill.
 */
class Billing
{
    public const SAC_RESTAURANT = '996331';

    public function __construct(
        private readonly TenantSettings $settings,
        private readonly SiteContent $content,
        private readonly Kitchen $kitchen,
    ) {}

    /**
     * @param  array{type: 'percent'|'amount', value: float|string, reason: ?string}|null  $discount
     * @param  array{name?: ?string, phone?: ?string, gstin?: ?string}|null  $buyer
     */
    /**
     * @param  array{coupon_code?: ?string, customer_phone?: ?string, points?: int}  $offers  coupon and loyalty points at the counter
     */
    public function bill(Tenant $tenant, Collection $orders, ?TableSession $session, ?array $discount, ?array $buyer, ?User $by, array $offers = []): Invoice
    {
        $orders = $orders->filter(fn (Order $o) => $o->status !== 'cancelled' && ! ($o->payment_method === 'online' && $o->payment_status !== 'paid'))->values();
        if ($orders->contains('payment_method', 'room')) {
            throw new ApiException('Room-service orders are billed with the stay at check-out.', 422, 'room_order');
        }
        if ($orders->isEmpty()) {
            throw new ApiException('There is nothing to bill.', 422, 'nothing_to_bill');
        }
        $billed = DB::table('invoice_order')->join('invoices', 'invoices.id', '=', 'invoice_order.invoice_id')
            ->whereIn('invoice_order.order_id', $orders->pluck('id'))->where('invoices.status', '!=', 'void')->pluck('invoices.number');
        if ($billed->isNotEmpty()) {
            throw new ApiException("Already billed on {$billed->first()}. Cancel that bill first to bill again.", 422, 'already_billed');
        }

        return DB::transaction(function () use ($tenant, $orders, $session, $discount, $buyer, $by, $offers) {
            $orders->each->loadMissing('items');
            $lines = [];
            foreach ($orders as $order) {
                foreach ($order->items as $item) {
                    $desc = $item->name.($item->variant_name ? " ({$item->variant_name})" : '');
                    if ($item->addons) {
                        $desc .= ' + '.implode(', ', array_column($item->addons, 'name'));
                    }
                    $lines[] = [
                        'description' => mb_substr($desc, 0, 250),
                        'quantity' => $item->quantity,
                        'unit' => Money::toPaise($item->unit_price),
                        'taxable' => Money::toPaise($item->line_subtotal),
                        'tax' => Money::toPaise($item->line_tax),
                        'rate' => Money::rateBp($item->tax_rate),
                    ];
                }
            }

            $itemsTotal = array_sum(array_column($lines, 'taxable'));
            $off = $this->discountPaise($discount, $itemsTotal);
            if ($off > 0 && trim((string) ($discount['reason'] ?? '')) === '') {
                throw new ApiException('Please give a reason for the discount.', 422, 'reason_required', ['field' => 'discount.reason']);
            }
            $reasons = $off > 0 ? [strip_tags((string) $discount['reason'])] : [];

            // Guest at the counter: coupon and / or loyalty points (staff see the guest in person).
            $guest = ! empty($offers['customer_phone']) ? Customer::where('phone', \App\Support\Phone::normalize($offers['customer_phone']))->first() : null;
            if (! empty($offers['customer_phone']) && ! $guest && ! empty($offers['points'])) {
                throw new ApiException('No customer with that mobile number.', 422, 'customer_not_found', ['field' => 'customer_phone']);
            }
            $coupon = null;
            $couponOff = 0;
            if (! empty($offers['coupon_code'])) {
                $coupon = app(Coupons::class)->find($offers['coupon_code'], 'pos');
                $couponOff = app(Coupons::class)->discount($coupon, $itemsTotal - $off, $guest?->id);
                $reasons[] = "Coupon {$coupon->code}";
            }
            $points = 0;
            $pointsOff = 0;
            if ($guest && ! empty($offers['points'])) {
                $r = app(Loyalty::class)->redeemable($guest, (int) $offers['points'], $itemsTotal - $off - $couponOff);
                [$points, $pointsOff] = [$r['points'], $r['paise']];
                if ($points > 0) {
                    $reasons[] = "{$points} loyalty points";
                }
            }
            $off += $couponOff + $pointsOff;
            if ($guest) {
                // The orders now belong to this guest (for points earned, spend and visits).
                Order::whereIn('id', $orders->pluck('id'))->whereNull('customer_id')->update(['customer_id' => $guest->id]);
                $orders->each(fn (Order $o) => $o->customer_id ??= $guest->id);
            }
            $shares = $this->share($off, array_column($lines, 'taxable'));

            $cgst = $sgst = $taxable = 0;
            $rows = [];
            foreach ($lines as $i => $l) {
                $lineTaxable = $l['taxable'] - $shares[$i];
                // Undiscounted lines keep the GST worked out when they were ordered.
                $lineTax = $shares[$i] === 0 ? $l['tax'] : Money::taxOnTop($lineTaxable, $l['rate']);
                $c = intdiv($lineTax, 2) + $lineTax % 2;
                $s = intdiv($lineTax, 2);
                $cgst += $c;
                $sgst += $s;
                $taxable += $lineTaxable;
                $rows[] = [
                    'description' => $l['description'],
                    'sac' => self::SAC_RESTAURANT,
                    'quantity' => $l['quantity'],
                    'unit_price' => Money::toRupees($l['unit']),
                    'discount' => Money::toRupees($shares[$i]),
                    'taxable_value' => Money::toRupees($lineTaxable),
                    'tax_rate' => Money::toRupees($l['rate']),
                    'cgst' => Money::toRupees($c),
                    'sgst' => Money::toRupees($s),
                    'total' => Money::toRupees($lineTaxable + $lineTax),
                ];
            }
            $charges = $orders->sum(fn (Order $o) => Money::toPaise($o->packaging_fee) + Money::toPaise($o->delivery_fee));
            $gross = $taxable + $cgst + $sgst + $charges;
            $total = (int) (round($gross / 100) * 100);
            $roundOff = $total - $gross;

            // Orders already paid online count as paid on this bill.
            $paidOnline = $orders->filter(fn (Order $o) => $o->payment_method === 'online' && $o->payment_status === 'paid');
            $paid = $paidOnline->sum(fn (Order $o) => Money::toPaise($o->total));
            if ($paid > $total) {
                throw new ApiException('The discount is more than what is still to be paid (part of this bill was paid online).', 422, 'discount_too_large', ['field' => 'discount.value']);
            }

            [$fy, $now, $date] = $this->periods($tenant);
            $seq = (int) Invoice::where('financial_year', $fy)->lockForUpdate()->max('sequence') + 1;
            $gstin = $tenant->gstin;
            $c = $this->content->get();

            $invoice = Invoice::create([
                'number' => sprintf('INV/%s/%04d', $fy, $seq),
                'financial_year' => $fy,
                'sequence' => $seq,
                'table_session_id' => $session?->id,
                'kind' => $gstin ? 'tax_invoice' : 'bill',
                'status' => 'unpaid',
                'seller' => [
                    'name' => $tenant->name,
                    'address' => implode(', ', array_filter([$c['contact']['address'] ?? null, $tenant->city])),
                    'gstin' => $gstin,
                    'fssai' => $c['legal']['fssai'] ?? null,
                    'phone' => $c['contact']['phone'] ?? null,
                ],
                'buyer' => $this->buyer($buyer, $orders),
                'items_total' => Money::toRupees($itemsTotal),
                'discount' => Money::toRupees($off),
                'discount_reason' => $off > 0 ? mb_substr(implode(' · ', $reasons), 0, 200) : null,
                'taxable_value' => Money::toRupees($taxable),
                'cgst' => Money::toRupees($cgst),
                'sgst' => Money::toRupees($sgst),
                'charges' => Money::toRupees($charges),
                'round_off' => Money::toRupees($roundOff),
                'total' => Money::toRupees($total),
                'paid' => '0.00',
                'prices_include_tax' => (bool) $orders->first()->prices_include_tax,
                'created_by' => $by?->id,
                'issued_at' => $now,
                'business_date' => $date,
            ]);
            foreach ($rows as $row) {
                InvoiceLine::create(['invoice_id' => $invoice->id] + $row);
            }
            $invoice->orders()->attach($orders->pluck('id'));
            if ($coupon) {
                app(Coupons::class)->redeem($coupon, $couponOff, null, $invoice->id, $guest?->id);
            }
            if ($points > 0) {
                app(Loyalty::class)->redeem($guest, $points, null, $invoice->id, $by?->id);
            }
            foreach ($paidOnline as $o) {
                $this->record($invoice, 'online', Money::toPaise($o->total), $o->public_id, null, $o->placed_at);
            }
            if ($off > 0) {
                AuditLog::record('bill.discount', $invoice, ['number' => $invoice->number, 'discount' => Money::toRupees($off), 'reason' => $invoice->discount_reason]);
            }
            $this->refreshPaid($invoice);
            if ($invoice->status === 'paid') {
                $this->settle($invoice, $by);
            }

            return $invoice;
        });
    }

    /**
     * Take payment. Several rows = split / mixed payment. Cash may be more than what is due
     * (the change is given back and only the bill amount is recorded); other modes may not.
     *
     * @param  list<array{mode: string, amount: float|string, reference?: ?string}>  $payments
     */
    public function pay(Invoice $invoice, array $payments, ?User $by): Invoice
    {
        return DB::transaction(function () use ($invoice, $payments, $by) {
            $invoice = Invoice::whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            if ($invoice->status !== 'unpaid') {
                throw new ApiException($invoice->status === 'paid' ? 'This bill is already paid.' : 'This bill was cancelled.', 422, 'not_payable');
            }
            $due = Money::toPaise($invoice->total) - Money::toPaise($invoice->paid);
            $rows = array_map(fn ($p) => ['mode' => $p['mode'], 'paise' => Money::toPaise($p['amount']), 'reference' => $p['reference'] ?? null], $payments);
            $rows = array_values(array_filter($rows, fn ($r) => $r['paise'] > 0));
            $sum = array_sum(array_column($rows, 'paise'));
            if ($sum < $due) {
                throw new ApiException('The payments add up to ₹'.Money::toRupees($sum).'; ₹'.Money::toRupees($due).' is due.', 422, 'short_payment');
            }
            $excess = $sum - $due;
            $nonCash = array_sum(array_map(fn ($r) => $r['mode'] === 'cash' ? 0 : $r['paise'], $rows));
            if ($nonCash > $due) {
                throw new ApiException('UPI, card and other payments can\'t be more than the bill. Only cash can have change.', 422, 'overpaid');
            }
            foreach ($rows as $r) {
                $amount = $r['paise'];
                if ($r['mode'] === 'cash' && $excess > 0) {
                    $back = min($excess, $amount);
                    $amount -= $back;
                    $excess -= $back;
                }
                if ($amount > 0 && $r['mode'] === 'gift_card') {
                    if (! $r['reference']) {
                        throw new ApiException('Enter the gift card code.', 422, 'gift_card_invalid');
                    }
                    $r['reference'] = app(GiftCards::class)->redeem($r['reference'], $amount, $invoice->id, $by?->id)->code;
                }
                if ($amount > 0) {
                    $this->record($invoice, $r['mode'], $amount, $r['reference'] ? strip_tags($r['reference']) : null, $by);
                }
            }
            $this->refreshPaid($invoice);
            $this->settle($invoice, $by);

            return $invoice->fresh(['lines', 'payments', 'orders']);
        });
    }

    /** Cancel an unpaid bill (to change it and bill again). Its orders become billable again. */
    public function void(Invoice $invoice, string $reason, ?User $by): Invoice
    {
        if ($invoice->status !== 'unpaid' || $invoice->payments()->where('mode', '!=', 'online')->exists()) {
            throw new ApiException('Only an unpaid bill can be cancelled.', 422, 'not_voidable');
        }
        $invoice->update(['status' => 'void', 'void_reason' => strip_tags($reason)]);
        app(Coupons::class)->reverse(null, $invoice->id);
        app(Loyalty::class)->reverseInvoice($invoice->id);
        AuditLog::record('bill.void', $invoice, ['number' => $invoice->number, 'reason' => $reason]);
        $this->emit($invoice);

        return $invoice->fresh();
    }

    /** Fully paid: orders completed and paid, the table's bill closed and the table marked for cleaning. */
    private function settle(Invoice $invoice, ?User $by): void
    {
        if ($invoice->status !== 'paid') {
            return;
        }
        foreach ($invoice->orders()->lockForUpdate()->get() as $order) {
            $changes = [];
            if ($order->payment_status !== 'paid') {
                $changes['payment_status'] = 'paid';
            }
            if ($order->status !== 'completed') {
                $changes['status'] = 'completed';
            }
            if ($changes) {
                $order->update($changes);
                if (isset($changes['status'])) {
                    OrderEvent::create(['order_id' => $order->id, 'status' => 'completed', 'note' => "Billed {$invoice->number}", 'user_id' => $by?->id, 'created_at' => now()]);
                }
                $this->kitchen->syncFromOrder($order);
                if (isset($changes['status'])) {
                    app(CustomerActivity::class)->orderCompleted($order->fresh());
                }
            }
        }
        if ($invoice->table_session_id) {
            $session = TableSession::whereKey($invoice->table_session_id)->lockForUpdate()->first();
            if ($session && $session->status === 'open') {
                // Online-unpaid orders on the table are released with it.
                Order::where('table_session_id', $session->id)->where('payment_method', 'online')->where('payment_status', '!=', 'paid')->where('status', '!=', 'cancelled')
                    ->get()->each(function (Order $o) use ($by) {
                        $o->update(['status' => 'cancelled', 'cancel_reason' => 'Table closed before payment']);
                        OrderEvent::create(['order_id' => $o->id, 'status' => 'cancelled', 'note' => 'Table closed before payment', 'user_id' => $by?->id, 'created_at' => now()]);
                        $this->kitchen->syncFromOrder($o);
                        app(CustomerActivity::class)->orderCancelled($o);
                    });
                $modes = $invoice->payments()->pluck('mode')->unique();
                $session->update([
                    'status' => 'closed', 'closed_at' => now(), 'closed_by' => $by?->id,
                    'payment_mode' => $modes->count() === 1 ? $modes->first() : ($modes->isEmpty() ? 'none' : 'split'),
                    'total' => $invoice->total,
                ]);
                DiningTable::whereKey($session->dining_table_id)->update(['cleaning_since' => now()]);
                TableRequest::where('dining_table_id', $session->dining_table_id)->whereNull('resolved_at')->update(['resolved_at' => now(), 'resolved_by' => $by?->id]);
                AuditLog::record('table.closed', $session, ['table_id' => $session->dining_table_id, 'total' => $invoice->total, 'invoice' => $invoice->number]);
            }
        }
        $this->emit($invoice);
    }

    private function refreshPaid(Invoice $invoice): void
    {
        $paid = $invoice->payments()->get()->sum(fn (BillPayment $p) => Money::toPaise($p->amount));
        $invoice->update([
            'paid' => Money::toRupees($paid),
            'status' => $paid >= Money::toPaise($invoice->total) ? 'paid' : 'unpaid',
        ]);
    }

    private function record(Invoice $invoice, string $mode, int $paise, ?string $reference, ?User $by, $at = null): void
    {
        [, $now, $date] = $this->periods($invoice->tenant()->first(), $at ? CarbonImmutable::parse($at) : null);
        BillPayment::create([
            'invoice_id' => $invoice->id,
            'mode' => $mode,
            'amount' => Money::toRupees($paise),
            'reference' => $reference,
            'received_by' => $by?->id,
            'received_at' => $now,
            'business_date' => $date,
        ]);
    }

    /** Discount in paise, never more than the items. */
    private function discountPaise(?array $discount, int $itemsTotal): int
    {
        if (! $discount || (float) ($discount['value'] ?? 0) <= 0) {
            return 0;
        }
        $off = $discount['type'] === 'percent'
            ? (int) round($itemsTotal * min(100, (float) $discount['value']) / 100)
            : Money::toPaise($discount['value']);
        if ($off > $itemsTotal) {
            throw new ApiException('The discount is more than the bill.', 422, 'discount_too_large', ['field' => 'discount.value']);
        }

        return $off;
    }

    /** Splits $total across $weights in proportion; leftover paise go to the largest remainders. */
    public static function share(int $total, array $weights): array
    {
        $sum = array_sum($weights);
        if ($total === 0 || $sum === 0) {
            return array_fill(0, count($weights), 0);
        }
        $out = [];
        $rem = [];
        foreach ($weights as $i => $w) {
            $exact = $total * $w / $sum;
            $out[$i] = (int) floor($exact);
            $rem[$i] = $exact - $out[$i];
        }
        $left = $total - array_sum($out);
        arsort($rem);
        foreach (array_keys($rem) as $i) {
            if ($left-- <= 0) {
                break;
            }
            $out[$i]++;
        }
        ksort($out);

        return array_values($out);
    }

    /** [financial year "2026-27", now (UTC), business-local date]. Indian FY runs April–March. */
    public function periods(Tenant $tenant, ?CarbonImmutable $at = null): array
    {
        $local = ($at ?? CarbonImmutable::now())->setTimezone($tenant->timezone);
        $start = $local->month >= 4 ? $local->year : $local->year - 1;

        return [sprintf('%d-%02d', $start, ($start + 1) % 100), ($at ?? CarbonImmutable::now())->utc(), $local->format('Y-m-d')];
    }

    private function buyer(?array $buyer, Collection $orders): ?array
    {
        $name = trim((string) ($buyer['name'] ?? '')) ?: null;
        $gstin = strtoupper(trim((string) ($buyer['gstin'] ?? ''))) ?: null;
        $phone = trim((string) ($buyer['phone'] ?? '')) ?: null;
        if (! $name && ! $gstin && ! $phone && $orders->count() === 1) {
            $o = $orders->first();
            $name = str_starts_with($o->customer_name, 'Table ') || $o->customer_name === 'Walk-in' ? null : $o->customer_name;
            $phone = $o->customer_phone;
        }

        return $name || $gstin || $phone ? ['name' => $name ? strip_tags($name) : null, 'phone' => $phone, 'gstin' => $gstin] : null;
    }

    private function emit(Invoice $invoice): void
    {
        Live::emit($invoice->tenant_id, 'orders', 'bill.changed', ['id' => $invoice->id, 'status' => $invoice->status]);
        if ($invoice->table_session_id) {
            Live::emit($invoice->tenant_id, 'tables', 'table.changed', ['session_id' => $invoice->table_session_id]);
        }
    }
}
