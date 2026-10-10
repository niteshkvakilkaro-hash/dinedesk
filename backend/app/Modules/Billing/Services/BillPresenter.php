<?php

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Support\Money;
use App\Support\AmountInWords;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;

class BillPresenter
{
    public function present(Invoice $i): array
    {
        $i->loadMissing(['lines', 'payments', 'orders', 'session.table']);

        return [
            'id' => $i->id,
            'public_id' => $i->public_id,
            'number' => $i->number,
            'kind' => $i->kind,
            'status' => $i->status,
            'seller' => $i->seller,
            'buyer' => $i->buyer,
            'table' => $i->session?->table?->label,
            'orders' => $i->orders->map(fn ($o) => ['id' => $o->id, 'number' => $o->number, 'type' => $o->type])->values(),
            'lines' => $i->lines->map(fn ($l) => [
                'description' => $l->description, 'sac' => $l->sac, 'quantity' => $l->quantity, 'unit_price' => $l->unit_price,
                'discount' => $l->discount, 'taxable_value' => $l->taxable_value, 'tax_rate' => $l->tax_rate,
                'cgst' => $l->cgst, 'sgst' => $l->sgst, 'total' => $l->total,
            ])->values(),
            'items_total' => $i->items_total,
            'discount' => $i->discount,
            'discount_reason' => $i->discount_reason,
            'taxable_value' => $i->taxable_value,
            'cgst' => $i->cgst,
            'sgst' => $i->sgst,
            'charges' => $i->charges,
            'round_off' => $i->round_off,
            'total' => $i->total,
            'paid' => $i->paid,
            'due' => Money::toRupees(Money::toPaise($i->total) - Money::toPaise($i->paid)),
            'payments' => $i->payments->map(fn ($p) => ['mode' => $p->mode, 'amount' => $p->amount, 'reference' => $p->reference, 'received_at' => $p->received_at->toIso8601String()])->values(),
            'prices_include_tax' => $i->prices_include_tax,
            'void_reason' => $i->void_reason,
            'issued_at' => $i->issued_at->toIso8601String(),
            'business_date' => $i->business_date->format('Y-m-d'),
            'amount_in_words' => AmountInWords::rupees(Money::toPaise($i->total)),
        ];
    }

    public function pdf(Invoice $i, string $timezone, bool $demo): \Barryvdh\DomPDF\PDF
    {
        $i->loadMissing(['lines', 'payments', 'orders', 'session.table']);

        return Pdf::loadView('pdf.invoice', [
            'invoice' => $i,
            'demo' => $demo,
            'issued' => CarbonImmutable::parse($i->issued_at)->setTimezone($timezone)->format('d M Y, g:i A'),
            'table' => $i->session?->table?->label,
            'orders' => $i->orders->pluck('number')->all(),
            'words' => AmountInWords::rupees(Money::toPaise($i->total)),
            'money' => fn ($v) => number_format((float) $v, 2),
        ])->setPaper('a4')->setOption('isFontSubsettingEnabled', true);
    }
}
