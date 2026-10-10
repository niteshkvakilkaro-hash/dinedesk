<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\DayClosing;
use App\Modules\Billing\Services\Billing;
use App\Modules\Billing\Services\DayReport;
use App\Modules\Tenancy\Support\TenantContext;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Day-end report and closing the cash drawer. */
class DayEndController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly DayReport $report,
    ) {}

    public function show(Request $request, Billing $billing): JsonResponse
    {
        $data = $request->validate(['date' => ['nullable', 'date_format:Y-m-d'], 'opening_cash' => ['nullable', 'numeric', 'min:0']]);
        $tenant = $this->context->require();
        $date = $data['date'] ?? $billing->periods($tenant)[2];
        $opening = $data['opening_cash'] ?? (float) (DayClosing::whereDate('business_date', $date)->value('opening_cash') ?? 0);

        return $this->ok($this->report->build($tenant, $date, (float) $opening) + [
            'recent_closings' => DayClosing::orderByDesc('business_date')->limit(10)->get()
                ->map(fn (DayClosing $c) => ['date' => $c->business_date->format('Y-m-d'), 'counted' => $c->counted_cash, 'expected' => $c->expected_cash, 'difference' => $c->difference])->values(),
        ]);
    }

    public function close(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'opening_cash' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'counted_cash' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
        $tenant = $this->context->require();
        $closing = $this->report->close($tenant, $data['date'], (float) $data['opening_cash'], (float) $data['counted_cash'], $data['notes'] ?? null, $request->user()->id);
        AuditLog::record('day.closed', $closing, ['date' => $data['date'], 'difference' => $closing->difference]);

        return $this->ok($this->report->build($tenant, $data['date'], (float) $data['opening_cash']), 'Day closed.');
    }

    public function pdf(Request $request, Billing $billing): Response
    {
        $tenant = $this->context->require();
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? $billing->periods($tenant)[2];
        $opening = (float) (DayClosing::whereDate('business_date', $date)->value('opening_cash') ?? 0);

        return Pdf::loadView('pdf.day-report', [
            'r' => $this->report->build($tenant, $date, $opening),
            'demo' => (bool) $tenant->is_demo,
            'dateLabel' => CarbonImmutable::parse($date)->format('l, j F Y'),
            'printed' => CarbonImmutable::now($tenant->timezone)->format('d M Y, g:i A'),
        ])->setPaper('a4')->setOption('isFontSubsettingEnabled', true)->download("day-end-{$date}.pdf");
    }
}
