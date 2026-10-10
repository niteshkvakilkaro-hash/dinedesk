<?php

namespace App\Modules\Hotel\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\BillPayment;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\InvoiceLine;
use App\Modules\Billing\Services\Billing;
use App\Modules\Hotel\Models\FolioItem;
use App\Modules\Hotel\Models\FolioPayment;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Services\SiteContent;
use App\Support\ApiException;
use Carbon\CarbonImmutable;

/**
 * A stay's folio: what the guest owes (room nights, room-service food, extras) and what
 * they have paid (advances, payments, refunds). Money is counted on the day it is received;
 * the GST invoice is made at check-out from the folio.
 */
class Folio
{
    public const SAC_OTHER = '999799';

    /** GST rates staff can pick for an extra charge (laundry, airport pick-up...). */
    public const EXTRA_RATES = [0, 5, 12, 18];

    public function __construct(private readonly Billing $billing) {}

    /** Room-night items always match the stay's nights and their quoted prices. */
    public function syncRoomCharges(RoomBooking $b, ?User $by = null): void
    {
        $label = $this->roomLabel($b);
        $byDate = collect($b->rates)->keyBy('date');
        $items = FolioItem::where('room_booking_id', $b->id)->where('type', 'room')->whereNull('voided_at')->get();
        foreach ($items as $item) {
            $rate = $byDate->get($item->service_date->format('Y-m-d'));
            $same = $rate && Money::toPaise($rate['price']) === Money::toPaise($item->amount) && Money::toPaise($rate['tax']) === Money::toPaise($item->tax);
            if (! $same) {
                $item->update(['voided_at' => now(), 'void_reason' => $rate ? 'Room rate changed' : 'Stay dates changed']);
            } else {
                $byDate->forget($item->service_date->format('Y-m-d'));
            }
        }
        foreach ($byDate as $date => $rate) {
            FolioItem::create([
                'room_booking_id' => $b->id,
                'type' => 'room',
                'description' => $label,
                'service_date' => $date,
                'quantity' => 1,
                'unit_price' => $rate['price'],
                'amount' => $rate['price'],
                'tax_rate' => $rate['tax_rate'],
                'tax' => $rate['tax'],
                'sac' => RoomPricing::SAC_ACCOMMODATION,
                'created_by' => $by?->id,
            ]);
        }
    }

    /** A room-service order goes on the folio of the guest in that room. */
    public function chargeOrder(Order $order): void
    {
        $fees = Money::toPaise($order->packaging_fee) + Money::toPaise($order->delivery_fee);
        $taxable = Money::toPaise($order->total) - Money::toPaise($order->tax_total) - $fees;
        FolioItem::create([
            'room_booking_id' => $order->room_booking_id,
            'type' => 'food',
            'description' => "Room service #{$order->number}",
            'service_date' => CarbonImmutable::now($order->tenant()->first()->timezone)->format('Y-m-d'),
            'quantity' => 1,
            'unit_price' => Money::toRupees($taxable + $fees),
            'amount' => Money::toRupees($taxable + $fees),
            'tax_rate' => '0.00', // dishes carry their own GST rates; the invoice lists them line by line
            'tax' => $order->tax_total,
            'sac' => Billing::SAC_RESTAURANT,
            'order_id' => $order->id,
        ]);
    }

    /** A cancelled room-service order comes off the folio. */
    public function orderCancelled(Order $order): void
    {
        FolioItem::where('order_id', $order->id)->whereNull('voided_at')->update(['voided_at' => now(), 'void_reason' => 'Order cancelled']);
    }

    public function addCharge(RoomBooking $b, string $description, int $quantity, float|string $unitPrice, float $rate, User $by): FolioItem
    {
        $this->ensureOpen($b);
        if (! in_array((int) $rate, self::EXTRA_RATES, true)) {
            throw new ApiException('Pick a GST rate of 0, 5, 12 or 18%.', 422, 'invalid_rate', ['field' => 'tax_rate']);
        }
        $amount = Money::toPaise($unitPrice) * $quantity;
        $item = FolioItem::create([
            'room_booking_id' => $b->id,
            'type' => 'extra',
            'description' => mb_substr(strip_tags($description), 0, 200),
            'service_date' => $this->today($b),
            'quantity' => $quantity,
            'unit_price' => Money::toRupees(Money::toPaise($unitPrice)),
            'amount' => Money::toRupees($amount),
            'tax_rate' => number_format($rate, 2, '.', ''),
            'tax' => Money::toRupees(Money::taxOnTop($amount, Money::rateBp($rate))),
            'sac' => self::SAC_OTHER,
            'created_by' => $by->id,
        ]);
        AuditLog::record('folio.charge', $b, ['code' => $b->code, 'description' => $item->description, 'amount' => $item->amount]);

        return $item;
    }

    /** Extras can be taken off (with a reason). Room nights follow the dates; food follows its order. */
    public function voidItem(RoomBooking $b, FolioItem $item, string $reason, User $by): void
    {
        $this->ensureOpen($b);
        if ($item->room_booking_id !== $b->id || $item->voided_at) {
            throw new ApiException('That charge is not on this stay.', 404, 'not_found');
        }
        if ($item->type !== 'extra') {
            throw new ApiException($item->type === 'room' ? 'Room nights follow the stay dates. Change the dates or the rate instead.' : 'Cancel the room-service order to take it off.', 422, 'not_removable');
        }
        $item->update(['voided_at' => now(), 'void_reason' => strip_tags($reason)]);
        AuditLog::record('folio.void', $b, ['code' => $b->code, 'description' => $item->description, 'amount' => $item->amount, 'reason' => $reason]);
    }

    public function addPayment(RoomBooking $b, string $kind, string $mode, float|string $amount, ?string $reference, ?User $by, ?CarbonImmutable $at = null): FolioPayment
    {
        $paise = Money::toPaise($amount);
        if ($paise <= 0) {
            throw new ApiException('Enter an amount.', 422, 'invalid_amount', ['field' => 'amount']);
        }
        if ($kind === 'refund' && $paise > $this->summary($b)['paid_paise']) {
            throw new ApiException('A refund can\'t be more than what was paid.', 422, 'refund_too_large', ['field' => 'amount']);
        }
        $tenant = $b->tenant()->first();
        [, $now, $date] = $this->billing->periods($tenant, $at);
        $payment = FolioPayment::create([
            'room_booking_id' => $b->id,
            'kind' => $kind,
            'mode' => $mode,
            'amount' => Money::toRupees($paise),
            'reference' => $reference ? mb_substr(strip_tags($reference), 0, 80) : null,
            'received_by' => $by?->id,
            'received_at' => $now,
            'business_date' => $date,
        ]);
        if ($kind === 'refund') {
            AuditLog::record('folio.refund', $b, ['code' => $b->code, 'amount' => $payment->amount, 'mode' => $mode]);
        }

        return $payment;
    }

    /**
     * What the stay has run up and what is paid. Before check-in the booked room total stands
     * in for the nights (they are posted when the guest checks in).
     */
    public function summary(RoomBooking $b): array
    {
        $items = FolioItem::where('room_booking_id', $b->id)->whereNull('voided_at')->get();
        $payments = FolioPayment::where('room_booking_id', $b->id)->get();
        $posted = $items->isNotEmpty() && $items->contains('type', 'room');
        $charges = $items->sum(fn ($i) => Money::toPaise($i->amount));
        $tax = $items->sum(fn ($i) => Money::toPaise($i->tax));
        if (! $posted && ! in_array($b->status, ['checked_in', 'checked_out'], true)) {
            $charges += Money::toPaise($b->room_total);
            $tax += Money::toPaise($b->tax_total);
        }
        $paid = $payments->whereIn('kind', ['advance', 'payment'])->sum(fn ($p) => Money::toPaise($p->amount));
        $refunded = $payments->where('kind', 'refund')->sum(fn ($p) => Money::toPaise($p->amount));
        $total = $charges + $tax;
        $net = $paid - $refunded;

        return [
            'charges' => Money::toRupees($charges),
            'tax' => Money::toRupees($tax),
            'total' => Money::toRupees($total),
            'paid' => Money::toRupees($net),
            'refunded' => Money::toRupees($refunded),
            'balance' => Money::toRupees($total - $net),
            'paid_paise' => $net,
            'balance_paise' => $total - $net,
        ];
    }

    /**
     * The check-out bill: room nights (SAC 996311, by price and rate), each room-service
     * dish (SAC 996331, at its own GST), extras. Paid from the folio, so it is born paid.
     */
    public function invoice(Tenant $tenant, RoomBooking $b, ?array $buyer, User $by): Invoice
    {
        $items = FolioItem::where('room_booking_id', $b->id)->whereNull('voided_at')->orderBy('service_date')->orderBy('id')->get();
        $lines = [];
        // Consecutive nights at the same price and rate become one line.
        foreach ($items->where('type', 'room')->groupBy(fn ($i) => $i->amount.'|'.$i->tax_rate) as $nights) {
            $first = $nights->first();
            $dates = $nights->map(fn ($i) => $i->service_date);
            $range = $dates->count() === 1 ? $dates->first()->format('j M') : $dates->first()->format('j M').' – '.$dates->last()->format('j M');
            $lines[] = [
                'description' => "{$first->description}, ".($dates->count() === 1 ? 'night of ' : 'nights ')."{$range}",
                'sac' => RoomPricing::SAC_ACCOMMODATION,
                'quantity' => $nights->count(),
                'unit' => Money::toPaise($first->amount),
                'taxable' => $nights->sum(fn ($i) => Money::toPaise($i->amount)),
                'tax' => $nights->sum(fn ($i) => Money::toPaise($i->tax)),
                'rate' => Money::rateBp($first->tax_rate),
            ];
        }
        $orders = Order::with('items')->where('room_booking_id', $b->id)->where('status', '!=', 'cancelled')->orderBy('id')->get();
        $fees = 0;
        foreach ($orders as $order) {
            $fees += Money::toPaise($order->packaging_fee) + Money::toPaise($order->delivery_fee);
            foreach ($order->items as $item) {
                $desc = "Room service #{$order->number}: {$item->name}".($item->variant_name ? " ({$item->variant_name})" : '');
                $lines[] = [
                    'description' => mb_substr($desc, 0, 250),
                    'sac' => Billing::SAC_RESTAURANT,
                    'quantity' => $item->quantity,
                    'unit' => Money::toPaise($item->unit_price),
                    'taxable' => Money::toPaise($item->line_subtotal),
                    'tax' => Money::toPaise($item->line_tax),
                    'rate' => Money::rateBp($item->tax_rate),
                ];
            }
        }
        foreach ($items->where('type', 'extra') as $x) {
            $lines[] = [
                'description' => $x->description,
                'sac' => $x->sac ?? self::SAC_OTHER,
                'quantity' => $x->quantity,
                'unit' => Money::toPaise($x->unit_price),
                'taxable' => Money::toPaise($x->amount),
                'tax' => Money::toPaise($x->tax),
                'rate' => Money::rateBp($x->tax_rate),
            ];
        }

        $cgst = $sgst = $taxable = 0;
        $rows = [];
        foreach ($lines as $l) {
            $c = intdiv($l['tax'], 2) + $l['tax'] % 2;
            $s = intdiv($l['tax'], 2);
            $cgst += $c;
            $sgst += $s;
            $taxable += $l['taxable'];
            $rows[] = [
                'description' => $l['description'],
                'sac' => $l['sac'],
                'quantity' => $l['quantity'],
                'unit_price' => Money::toRupees($l['unit']),
                'discount' => '0.00',
                'taxable_value' => Money::toRupees($l['taxable']),
                'tax_rate' => Money::toRupees($l['rate']),
                'cgst' => Money::toRupees($c),
                'sgst' => Money::toRupees($s),
                'total' => Money::toRupees($l['taxable'] + $l['tax']),
            ];
        }
        $gross = $taxable + $cgst + $sgst + $fees;
        // The folio total is what the guest paid: the bill keeps it to the paisa (no round-off).
        [$fy, $now, $date] = $this->billing->periods($tenant);
        $seq = (int) Invoice::where('financial_year', $fy)->lockForUpdate()->max('sequence') + 1;
        $c = app(SiteContent::class)->get();
        $invoice = Invoice::create([
            'number' => sprintf('INV/%s/%04d', $fy, $seq),
            'financial_year' => $fy,
            'sequence' => $seq,
            'room_booking_id' => $b->id,
            'kind' => $tenant->gstin ? 'tax_invoice' : 'bill',
            'status' => 'paid',
            'seller' => [
                'name' => $tenant->name,
                'address' => implode(', ', array_filter([$c['contact']['address'] ?? null, $tenant->city])),
                'gstin' => $tenant->gstin,
                'fssai' => $c['legal']['fssai'] ?? null,
                'phone' => $c['contact']['phone'] ?? null,
            ],
            'buyer' => [
                'name' => trim((string) ($buyer['name'] ?? '')) ?: ($b->company ?: $b->name),
                'phone' => $b->phone,
                'gstin' => strtoupper(trim((string) ($buyer['gstin'] ?? ''))) ?: $b->gstin,
            ],
            'items_total' => Money::toRupees($taxable),
            'discount' => '0.00',
            'taxable_value' => Money::toRupees($taxable),
            'cgst' => Money::toRupees($cgst),
            'sgst' => Money::toRupees($sgst),
            'charges' => Money::toRupees($fees),
            'round_off' => '0.00',
            'total' => Money::toRupees($gross),
            'paid' => Money::toRupees($gross),
            'prices_include_tax' => false,
            'created_by' => $by->id,
            'issued_at' => $now,
            'business_date' => $date,
        ]);
        foreach ($rows as $row) {
            InvoiceLine::create(['invoice_id' => $invoice->id] + $row);
        }
        // The money itself was counted on the folio, on the days it came in.
        BillPayment::create([
            'invoice_id' => $invoice->id,
            'mode' => 'folio',
            'amount' => Money::toRupees($gross),
            'reference' => $b->code,
            'received_by' => $by->id,
            'received_at' => $now,
            'business_date' => $date,
        ]);
        $invoice->orders()->attach($orders->pluck('id'));

        return $invoice;
    }

    public function present(RoomBooking $b): array
    {
        $items = FolioItem::where('room_booking_id', $b->id)->orderBy('service_date')->orderBy('id')->get();
        $payments = FolioPayment::where('room_booking_id', $b->id)->orderBy('id')->get();
        $s = $this->summary($b);
        unset($s['paid_paise'], $s['balance_paise']);

        return [
            'items' => $items->map(fn (FolioItem $i) => [
                'id' => $i->id, 'type' => $i->type, 'description' => $i->description, 'date' => $i->service_date->format('Y-m-d'),
                'quantity' => $i->quantity, 'unit_price' => $i->unit_price, 'amount' => $i->amount, 'tax_rate' => $i->tax_rate, 'tax' => $i->tax,
                'order_id' => $i->order_id, 'voided' => (bool) $i->voided_at, 'void_reason' => $i->void_reason,
            ])->values(),
            'payments' => $payments->map(fn (FolioPayment $p) => [
                'id' => $p->id, 'kind' => $p->kind, 'mode' => $p->mode, 'amount' => $p->amount, 'reference' => $p->reference, 'received_at' => $p->received_at->toIso8601String(),
            ])->values(),
            'summary' => $s,
        ];
    }

    private function roomLabel(RoomBooking $b): string
    {
        $b->loadMissing(['type', 'room']);

        return $b->room ? "{$b->type->name}, room {$b->room->number}" : $b->type->name;
    }

    private function ensureOpen(RoomBooking $b): void
    {
        if (! in_array($b->status, ['confirmed', 'checked_in'], true)) {
            throw new ApiException('This stay\'s bill is closed.', 422, 'folio_closed');
        }
    }

    private function today(RoomBooking $b): string
    {
        return CarbonImmutable::now($b->tenant()->first()->timezone)->format('Y-m-d');
    }
}
