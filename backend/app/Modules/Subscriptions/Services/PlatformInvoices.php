<?php

namespace App\Modules\Subscriptions\Services;

use App\Models\User;
use App\Modules\Ordering\Support\Money;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Subscriptions\Models\PlatformInvoice;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\AmountInWords;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Tax invoices for subscription charges, numbered PREFIX/FY/0001 across the platform.
 * The amount charged includes GST (when the platform has a GSTIN): CGST + SGST inside
 * the platform's state, IGST across states.
 */
class PlatformInvoices
{
    public function __construct(private readonly PlatformSettings $settings) {}

    public function forCharge(Subscription $s, string $paymentId, int $amountPaise, ?CarbonImmutable $start, ?CarbonImmutable $end): PlatformInvoice
    {
        return DB::transaction(function () use ($s, $paymentId, $amountPaise, $start, $end) {
            $existing = PlatformInvoice::withoutTenancy()->where('provider_payment_id', $paymentId)->first();
            if ($existing) {
                return $existing;
            }
            $seller = $this->settings->get('seller');
            $rate = $this->settings->gstRate();
            $taxable = $rate > 0 ? (int) round($amountPaise * 100 / (100 + $rate)) : $amountPaise;
            $tax = $amountPaise - $taxable;
            $tenant = Tenant::findOrFail($s->tenant_id);
            $owner = User::where('tenant_id', $tenant->id)->orderBy('id')->first();
            $buyerState = $tenant->gstin ? substr($tenant->gstin, 0, 2) : null;
            $intra = ! $buyerState || ! $seller['state_code'] || $buyerState === $seller['state_code'];

            $now = CarbonImmutable::now('Asia/Kolkata');
            $fyStart = $now->month >= 4 ? $now->year : $now->year - 1;
            $fy = sprintf('%d-%02d', $fyStart, ($fyStart + 1) % 100);
            $seq = (int) PlatformInvoice::withoutTenancy()->where('financial_year', $fy)->lockForUpdate()->max('sequence') + 1;

            return PlatformInvoice::create([
                'tenant_id' => $tenant->id,
                'subscription_id' => $s->id,
                'number' => sprintf('%s/%s/%04d', $seller['invoice_prefix'] ?: 'DD', $fy, $seq),
                'financial_year' => $fy,
                'sequence' => $seq,
                'plan_code' => $s->plan()->first()->code,
                'billing_cycle' => $s->billing_cycle,
                'period_start' => $start?->format('Y-m-d'),
                'period_end' => $end?->format('Y-m-d'),
                'seller' => $seller,
                'buyer' => ['name' => $tenant->name, 'gstin' => $tenant->gstin, 'city' => $tenant->city, 'email' => $owner?->email, 'phone' => $owner?->phone, 'state_code' => $buyerState],
                'sac' => $this->settings->get('billing')['sac'],
                'taxable_value' => Money::toRupees($taxable),
                'gst_rate' => number_format($rate, 2, '.', ''),
                'cgst' => Money::toRupees($intra ? intdiv($tax, 2) + $tax % 2 : 0),
                'sgst' => Money::toRupees($intra ? intdiv($tax, 2) : 0),
                'igst' => Money::toRupees($intra ? 0 : $tax),
                'total' => Money::toRupees($amountPaise),
                'provider_payment_id' => $paymentId,
                'issued_at' => now(),
            ]);
        });
    }

    public function present(PlatformInvoice $i): array
    {
        return [
            'id' => $i->public_id, 'number' => $i->number, 'plan' => $i->plan_code, 'billing_cycle' => $i->billing_cycle,
            'period_start' => $i->period_start?->format('Y-m-d'), 'period_end' => $i->period_end?->format('Y-m-d'),
            'taxable_value' => $i->taxable_value, 'cgst' => $i->cgst, 'sgst' => $i->sgst, 'igst' => $i->igst, 'total' => $i->total,
            'issued_at' => $i->issued_at->toIso8601String(),
        ];
    }

    public function pdf(PlatformInvoice $i): \Barryvdh\DomPDF\PDF
    {
        return Pdf::loadView('pdf.platform-invoice', [
            'i' => $i,
            'issued' => CarbonImmutable::parse($i->issued_at)->setTimezone('Asia/Kolkata')->format('d M Y'),
            'words' => AmountInWords::rupees(Money::toPaise($i->total)),
            'money' => fn ($v) => number_format((float) $v, 2),
        ])->setPaper('a4')->setOption('isFontSubsettingEnabled', true);
    }
}
