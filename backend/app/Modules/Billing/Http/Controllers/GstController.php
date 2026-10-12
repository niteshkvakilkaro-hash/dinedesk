<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\GstReport;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderItem;
use App\Modules\Ordering\Support\Money;
use App\Modules\Reports\Services\Analytics;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** GST for the month (GSTR-1 sections as CSV for the CA) and Tally Prime sales vouchers (XML). */
class GstController extends Controller
{
    public const SECTIONS = ['b2b', 'b2cs', 'hsn', 'docs', 'tally'];

    /** Ledger names the Tally file uses; create them once in Tally (see the dashboard note). */
    public const LEDGERS = [
        'party' => 'Cash Sales',
        'online' => 'Online Sales',
        'cgst' => 'Output CGST',
        'sgst' => 'Output SGST',
        'charges' => 'Packaging & Delivery Charges',
        'round_off' => 'Round Off',
        'sales' => 'Sales @ :rate%',
    ];

    public function __construct(private readonly TenantContext $context, private readonly GstReport $gst) {}

    public function show(Request $request): JsonResponse
    {
        $report = $this->gst->month($this->context->require(), $this->month($request));
        unset($report['invoices']);

        return $this->ok($report + ['ledgers' => array_values(self::LEDGERS)]);
    }

    public function export(Request $request, string $section): StreamedResponse
    {
        if (! in_array($section, self::SECTIONS, true)) {
            throw new ApiException('Unknown export.', 404, 'not_found');
        }
        $tenant = $this->context->require();
        $month = $this->month($request);
        $r = $this->gst->month($tenant, $month);
        if ($section === 'tally') {
            $xml = $this->tally($tenant, $r);

            return response()->streamDownload(fn () => print ($xml), "tally-sales-{$month}.xml", ['Content-Type' => 'application/xml; charset=UTF-8']);
        }

        [$head, $rows] = match ($section) {
            'b2b' => [['GSTIN of recipient', 'Receiver name', 'Invoice number', 'Invoice date', 'Invoice value', 'Place of supply', 'Reverse charge', 'Invoice type', 'Rate', 'Taxable value', 'CGST', 'SGST', 'Cess'],
                collect($r['b2b'])->map(fn ($b) => [$b['gstin'], $b['name'], $b['number'], $b['date'], $b['value'], $b['place_of_supply'], 'N', 'Regular', $b['rate'], $b['taxable'], $b['cgst'], $b['sgst'], '0.00'])],
            'b2cs' => [['Type', 'Place of supply', 'Rate', 'Taxable value', 'CGST', 'SGST', 'Cess'],
                collect($r['b2cs'])->map(fn ($b) => ['OE', $b['place_of_supply'], $b['rate'], $b['taxable'], $b['cgst'], $b['sgst'], '0.00'])],
            'hsn' => [['HSN/SAC', 'Description', 'UQC', 'Total quantity', 'Rate', 'Taxable value', 'CGST', 'SGST', 'Total value'],
                collect($r['hsn'])->map(fn ($h) => [$h['sac'], $h['sac'] === '996311' ? 'Room accommodation' : 'Restaurant / food service', 'NA', $h['quantity'], $h['rate'], $h['taxable'], $h['cgst'], $h['sgst'], $h['total']])],
            'docs' => [['Nature of document', 'Series', 'From', 'To', 'Total issued', 'Cancelled'],
                collect($r['docs'])->map(fn ($d) => ['Invoices for outward supply', $d['series'], $d['from'], $d['to'], $d['total'], $d['cancelled']])],
        };

        return response()->streamDownload(function () use ($head, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $head);
            foreach ($rows as $row) {
                fputcsv($out, array_map(fn ($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'".$v : $v, $row));
            }
            fclose($out);
        }, "gstr1-{$section}-{$month}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Sales vouchers for Tally Prime: one per bill, and one per day for orders paid without a bill. */
    private function tally(Tenant $tenant, array $r): string
    {
        $vouchers = [];
        foreach ($r['invoices'] as $i) {
            /** @var Invoice $i */
            $party = ! empty($i->buyer['gstin']) ? ($i->buyer['name'] ?: $i->buyer['gstin']) : self::LEDGERS['party'];
            $byRate = $i->lines->groupBy(fn ($l) => (string) (float) $l->tax_rate)->map(fn ($ls) => (int) $ls->sum(fn ($l) => Money::toPaise($l->taxable_value)));
            $vouchers[] = $this->voucher($i->business_date->format('Ymd'), $i->number, $party, Money::toPaise($i->total), $byRate->all(), Money::toPaise($i->cgst), Money::toPaise($i->sgst), Money::toPaise($i->charges), Money::toPaise($i->round_off), "Bill {$i->number}");
        }
        // Orders that never got a bill (website / online), grouped by day.
        $from = CarbonImmutable::createFromFormat('Y-m-d', "{$r['month']}-01", $tenant->timezone)->startOfMonth();
        $billed = DB::table('invoice_order')->join('invoices', 'invoices.id', '=', 'invoice_order.invoice_id')->where('invoices.status', '!=', 'void')->pluck('invoice_order.order_id')->all();
        $orders = app(Analytics::class)->orders($tenant, $from->format('Y-m-d'), $from->endOfMonth()->format('Y-m-d'))
            ->filter(fn (Order $o) => Analytics::counts($o) && $o->type !== 'room_service' && ! in_array($o->id, $billed, true));
        $items = OrderItem::whereIn('order_id', $orders->pluck('id'))->get()->groupBy('order_id');
        foreach ($orders->groupBy(fn (Order $o) => CarbonImmutable::parse($o->placed_at)->setTimezone($tenant->timezone)->format('Ymd')) as $day => $dayOrders) {
            $byRate = [];
            $tax = $total = $lineTotal = 0;
            foreach ($dayOrders as $o) {
                $total += Money::toPaise($o->total);
                foreach ($items[$o->id] ?? [] as $l) {
                    $rate = (string) (float) $l->tax_rate;
                    $byRate[$rate] = ($byRate[$rate] ?? 0) + Money::toPaise($l->line_subtotal);
                    $tax += Money::toPaise($l->line_tax);
                    $lineTotal += Money::toPaise($l->line_subtotal) + Money::toPaise($l->line_tax);
                }
            }
            $cgst = intdiv($tax, 2);
            $vouchers[] = $this->voucher($day, "WEB-{$day}", self::LEDGERS['online'], $total, $byRate, $cgst, $tax - $cgst, $total - $lineTotal, 0, $dayOrders->count().' orders paid without a bill');
        }
        $company = htmlspecialchars($tenant->name, ENT_XML1);

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n<ENVELOPE>\n <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n <BODY>\n  <IMPORTDATA>\n"
            ."   <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{$company}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>\n"
            ."   <REQUESTDATA>\n".implode('', $vouchers)."   </REQUESTDATA>\n  </IMPORTDATA>\n </BODY>\n</ENVELOPE>\n";
    }

    /** One balanced sales voucher: the party is debited the total, sales / GST / charges credited. */
    private function voucher(string $date, string $number, string $party, int $total, array $byRate, int $cgst, int $sgst, int $charges, int $roundOff, string $narration): string
    {
        $x = fn (string $s) => htmlspecialchars($s, ENT_XML1);
        $amt = fn (int $paise) => number_format($paise / 100, 2, '.', '');
        $entry = fn (string $ledger, int $paise) => '       <ALLLEDGERENTRIES.LIST><LEDGERNAME>'.$x($ledger).'</LEDGERNAME><ISDEEMEDPOSITIVE>'.($paise < 0 ? 'Yes' : 'No').'</ISDEEMEDPOSITIVE><AMOUNT>'.$amt($paise)."</AMOUNT></ALLLEDGERENTRIES.LIST>\n";
        $lines = $entry($party, -$total);
        foreach ($byRate as $rate => $paise) {
            if ($paise) {
                $lines .= $entry(str_replace(':rate', rtrim(rtrim(number_format((float) $rate, 2, '.', ''), '0'), '.'), self::LEDGERS['sales']), $paise);
            }
        }
        foreach ([[self::LEDGERS['cgst'], $cgst], [self::LEDGERS['sgst'], $sgst], [self::LEDGERS['charges'], $charges], [self::LEDGERS['round_off'], $roundOff]] as [$ledger, $paise]) {
            if ($paise) {
                $lines .= $entry($ledger, $paise);
            }
        }

        return "    <TALLYMESSAGE xmlns:UDF=\"TallyUDF\">\n     <VOUCHER VCHTYPE=\"Sales\" ACTION=\"Create\">\n"
            ."      <DATE>{$date}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>".$x($number).'</VOUCHERNUMBER><PARTYLEDGERNAME>'.$x($party).'</PARTYLEDGERNAME><NARRATION>'.$x($narration)."</NARRATION>\n"
            .$lines."     </VOUCHER>\n    </TALLYMESSAGE>\n";
    }

    private function month(Request $request): string
    {
        return (string) ($request->validate(['month' => ['nullable', 'date_format:Y-m']])['month'] ?? CarbonImmutable::now($this->context->require()->timezone)->format('Y-m'));
    }
}
