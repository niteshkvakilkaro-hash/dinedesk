<?php

namespace App\Modules\Reports\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Reports\Services\Analytics;
use App\Modules\Reports\Services\Dashboard;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Dashboard → Reports: analytics for a period and CSV exports. */
class ReportsController extends Controller
{
    public const EXPORTS = ['orders', 'sales', 'dishes', 'categories', 'customers', 'reservations', 'stays'];

    public function __construct(private readonly TenantContext $context, private readonly Analytics $analytics) {}

    public function dashboard(Request $request, Dashboard $dashboard): JsonResponse
    {
        return $this->ok($dashboard->build($this->context->require(), $request->user()));
    }

    public function overview(Request $request): JsonResponse
    {
        [$from, $to, $by] = $this->period($request);

        return $this->ok($this->analytics->overview($this->context->require(), $from, $to, $by));
    }

    /** CSV (opens in Excel / Google Sheets). Numbers only from real records. */
    public function export(Request $request, string $type): StreamedResponse
    {
        if (! in_array($type, self::EXPORTS, true)) {
            throw new ApiException('Unknown export.', 404, 'not_found');
        }
        [$from, $to, $by] = $this->period($request);
        $tenant = $this->context->require();
        $tz = $tenant->timezone;

        [$head, $rows] = match ($type) {
            'orders' => [
                ['Order', 'Placed (IST)', 'Type', 'Channel', 'Status', 'Customer', 'Phone', 'Items', 'GST', 'Discount', 'Packaging', 'Delivery', 'Total', 'Payment', 'Payment status'],
                $this->analytics->orders($tenant, $from, $to)->load('items')->map(fn ($o) => [
                    $o->number, CarbonImmutable::parse($o->placed_at)->setTimezone($tz)->format('Y-m-d H:i'), $o->type, $o->source, $o->status,
                    $o->customer_name, $o->customer_phone, $o->items->sum('quantity'), $o->tax_total, $o->discount_total, $o->packaging_fee, $o->delivery_fee,
                    $o->total, $o->payment_method, $o->payment_status,
                ]),
            ],
            'sales' => [
                ['Period', 'Orders', 'Sales'],
                collect($this->analytics->overview($tenant, $from, $to, $by)['series'])->map(fn ($r) => [$r['period'], $r['orders'], $r['sales']]),
            ],
            'dishes' => [
                ['Dish', 'Category', 'Quantity', 'Sales', 'On the menu'],
                collect($this->analytics->overview($tenant, $from, $to)['dishes']['all'])->map(fn ($r) => [$r['name'], $r['category'], $r['quantity'], $r['sales'], $r['available'] ? 'yes' : 'no']),
            ],
            'categories' => [
                ['Category', 'Quantity', 'Sales', 'Share %'],
                collect($this->analytics->overview($tenant, $from, $to)['categories'])->map(fn ($r) => [$r['category'], $r['quantity'], $r['sales'], $r['share']]),
            ],
            'customers' => [
                ['Name', 'Phone', 'Email', 'Orders', 'Visits', 'Total spent', 'Points', 'Tags', 'Offers opt-in', 'Last order (IST)'],
                Customer::orderByDesc('total_spent')->get()->map(fn ($c) => [
                    $c->name, $c->phone, $c->email, $c->orders_count, $c->visits, $c->total_spent, $c->loyalty_points,
                    implode('; ', $c->tags ?? []), $c->marketing_opt_in ? 'yes' : 'no', $c->last_order_at?->setTimezone($tz)->format('Y-m-d H:i'),
                ]),
            ],
            'reservations' => [
                ['Booking ID', 'Date', 'Time', 'Guests', 'Name', 'Phone', 'Status', 'Source', 'Table'],
                Reservation::with('table')->whereDate('date', '>=', $from)->whereDate('date', '<=', $to)->orderBy('starts_at')->get()->map(fn ($r) => [
                    $r->code, $r->date->format('Y-m-d'), $r->time, $r->party_size, $r->name, $r->phone, $r->status, $r->source, $r->table?->label,
                ]),
            ],
            'stays' => [
                ['Booking ID', 'Check-in', 'Check-out', 'Nights', 'Room type', 'Room', 'Guest', 'Phone', 'Adults', 'Children', 'Status', 'Source', 'Room charges', 'GST', 'Total', 'Invoice'],
                RoomBooking::with(['type', 'room', 'invoice'])->where('check_in', '<=', $to)->where('check_out', '>', $from)->orderBy('check_in')->get()->map(fn ($b) => [
                    $b->code, $b->check_in->format('Y-m-d'), $b->check_out->format('Y-m-d'), $b->nights, $b->type->name, $b->room?->number, $b->name, $b->phone,
                    $b->adults, $b->children, $b->status, $b->source, $b->room_total, $b->tax_total, $b->total, $b->invoice?->number,
                ]),
            ],
        };

        return response()->streamDownload(function () use ($head, $rows) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM: Excel opens ₹ and Hindi correctly
            fputcsv($out, $head);
            foreach ($rows as $row) {
                // Cells starting with = + - @ would run as formulas in a spreadsheet.
                fputcsv($out, array_map(fn ($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'".$v : $v, $row));
            }
            fclose($out);
        }, "{$type}-{$from}-to-{$to}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return array{0: string, 1: string, 2: string} */
    private function period(Request $request): array
    {
        $tz = $this->context->require()->timezone;
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'by' => ['nullable', Rule::in(['day', 'week', 'month'])],
        ]);
        $to = $data['to'] ?? CarbonImmutable::now($tz)->format('Y-m-d');
        $from = $data['from'] ?? CarbonImmutable::parse($to)->subDays(29)->format('Y-m-d');
        if (CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) > 366) {
            throw new ApiException('Choose a period of at most a year.', 422, 'period_too_long');
        }

        return [$from, $to, $data['by'] ?? 'day'];
    }
}
