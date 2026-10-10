<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\BillPayment;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\Billing;
use App\Modules\Billing\Services\BillPresenter;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\Pricing;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/** POS: menu, staff orders (send KOT), open bills, billing with GST invoices and payments. */
class BillingController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly Billing $billing,
        private readonly BillPresenter $presenter,
    ) {}

    /** The whole menu with availability (sold-out items shown, not orderable). */
    public function menu(SitePresenter $site): JsonResponse
    {
        return $this->ok($site->menu());
    }

    /** Order entered by staff (POS or waiter app): confirmed and sent to the kitchen. */
    public function placeOrder(Request $request, OrderFlow $flow): JsonResponse
    {
        if ($request->filled('customer.phone')) {
            $request->merge(['customer' => ['phone' => Phone::normalize($request->input('customer.phone'))] + $request->input('customer')]);
        }
        $data = $request->validate([
            'type' => ['required', Rule::in(['dine_in', 'takeaway'])],
            'source' => ['required', Rule::in(['pos', 'waiter'])],
            'dining_table_id' => ['nullable', 'required_if:type,dine_in', 'integer', Rule::exists('dining_tables', 'id')->where('tenant_id', $this->context->id())->whereNull('deleted_at')],
            'customer' => ['nullable', 'array'],
            'customer.name' => ['nullable', 'string', 'max:120'],
            'customer.phone' => ['nullable', Phone::RULE],
            'notes' => ['nullable', 'string', 'max:500'],
            ...Pricing::lineRules(),
        ], ['customer.phone.regex' => Phone::MESSAGE, 'dining_table_id.required_if' => 'Choose a table.']);

        $order = $flow->placeByStaff($this->context->require(), $data, $request->user(), $data['source']);

        return $this->created(['id' => $order->id, 'number' => $order->number, 'table_session_id' => $order->table_session_id, 'total' => $order->total], 'Sent to the kitchen.');
    }

    /** Everything waiting to be paid: open tables, unbilled pay-later orders, unpaid bills. */
    public function open(): JsonResponse
    {
        $billed = DB::table('invoice_order')->join('invoices', 'invoices.id', '=', 'invoice_order.invoice_id')->where('invoices.status', '!=', 'void')->select('invoice_order.order_id');
        $sessions = TableSession::with(['table', 'orders'])->where('status', 'open')->orderBy('opened_at')->get();
        // Room-service orders are billed with the stay at check-out.
        $orders = Order::whereNull('table_session_id')->where('payment_method', '!=', 'room')->whereNotIn('status', ['cancelled'])->where('payment_status', 'unpaid')
            ->whereNotIn('id', $billed)->where('placed_at', '>', now()->subDays(2))->orderBy('id')->get();
        $unpaid = Invoice::with('session.table')->where('status', 'unpaid')->orderBy('id')->get()->keyBy('table_session_id');
        $sum = fn ($rows) => Money::toRupees($rows->sum(fn ($o) => Money::toPaise($o->total)));

        return $this->ok([
            'tables' => $sessions->map(fn (TableSession $s) => [
                'session_id' => $s->id,
                'table' => $s->table->label,
                'opened_at' => $s->opened_at->toIso8601String(),
                'bill_requested' => (bool) $s->bill_requested_at,
                'orders' => $s->orders->where('status', '!=', 'cancelled')->count(),
                'total' => $sum($s->orders->filter(fn ($o) => $o->status !== 'cancelled' && ! ($o->payment_method === 'online' && $o->payment_status !== 'paid'))),
                'invoice' => ($inv = $unpaid->get($s->id)) ? ['id' => $inv->id, 'number' => $inv->number, 'total' => $inv->total, 'due' => Money::toRupees(Money::toPaise($inv->total) - Money::toPaise($inv->paid))] : null,
            ])->values(),
            'orders' => $orders->map(fn (Order $o) => ['id' => $o->id, 'number' => $o->number, 'type' => $o->type, 'source' => $o->source, 'status' => $o->status, 'customer_name' => $o->customer_name, 'total' => $o->total, 'placed_at' => $o->placed_at->toIso8601String()])->values(),
            'bills' => Invoice::whereNull('table_session_id')->where('status', 'unpaid')->orderBy('id')->get()
                ->map(fn (Invoice $i) => ['id' => $i->id, 'number' => $i->number, 'total' => $i->total, 'due' => Money::toRupees(Money::toPaise($i->total) - Money::toPaise($i->paid))])->values(),
        ]);
    }

    /** Bills issued on a day (business date). */
    public function index(Request $request): JsonResponse
    {
        $date = $request->validate(['date' => ['nullable', 'date_format:Y-m-d']])['date'] ?? $this->billing->periods($this->context->require())[2];

        return $this->ok(Invoice::with('payments')->whereDate('business_date', $date)->orderByDesc('id')->get()->map(fn (Invoice $i) => [
            'id' => $i->id, 'number' => $i->number, 'status' => $i->status, 'total' => $i->total, 'paid' => $i->paid,
            'discount' => $i->discount, 'issued_at' => $i->issued_at->toIso8601String(), 'modes' => $i->payments->pluck('mode')->unique()->values(),
        ])->values());
    }

    /** Make the bill (GST invoice) for one or more orders, or for a table. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_id' => ['nullable', 'required_without:order_ids', 'integer'],
            'order_ids' => ['nullable', 'array', 'min:1', 'max:30'],
            'order_ids.*' => ['integer'],
            'discount' => ['nullable', 'array'],
            'discount.type' => ['required_with:discount', Rule::in(['percent', 'amount'])],
            'discount.value' => ['required_with:discount', 'numeric', 'min:0'],
            'discount.reason' => ['nullable', 'string', 'max:200'],
            'buyer' => ['nullable', 'array'],
            'buyer.name' => ['nullable', 'string', 'max:120'],
            'buyer.phone' => ['nullable', 'string', 'max:20'],
            'buyer.gstin' => ['nullable', 'regex:/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i'],
            'coupon_code' => ['nullable', 'string', 'max:30'],
            'customer_phone' => ['nullable', 'string', 'max:20'],
            'points' => ['nullable', 'integer', 'min:0'],
        ], ['buyer.gstin.regex' => 'Enter a valid 15-character GSTIN.']);

        $session = null;
        if (! empty($data['session_id'])) {
            $session = TableSession::where('status', 'open')->findOrFail($data['session_id']);
            if ($open = Invoice::where('table_session_id', $session->id)->where('status', 'unpaid')->first()) {
                throw new ApiException("This table already has bill {$open->number}. Cancel it to make a new one.", 422, 'already_billed');
            }
            $orders = Order::where('table_session_id', $session->id)->get();
        } else {
            $orders = Order::whereIn('id', $data['order_ids'])->get();
            if ($orders->count() !== count(array_unique($data['order_ids']))) {
                throw new ApiException('Order not found.', 404, 'not_found');
            }
        }
        $invoice = $this->billing->bill($this->context->require(), $orders, $session, $data['discount'] ?? null, $data['buyer'] ?? null, $request->user(), ['coupon_code' => $data['coupon_code'] ?? null, 'customer_phone' => $data['customer_phone'] ?? null, 'points' => $data['points'] ?? 0]);

        return $this->created($this->presenter->present($invoice->fresh()), 'Bill ready.');
    }

    public function show(int $id): JsonResponse
    {
        return $this->ok($this->presenter->present(Invoice::findOrFail($id)));
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'payments' => ['required', 'array', 'min:1', 'max:10'],
            'payments.*.mode' => ['required', Rule::in(array_values(array_diff(BillPayment::MODES, ['online'])))],
            'payments.*.amount' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'payments.*.reference' => ['nullable', 'string', 'max:80'],
        ]);
        $invoice = $this->billing->pay(Invoice::findOrFail($id), $data['payments'], $request->user());

        return $this->ok($this->presenter->present($invoice), 'Paid.');
    }

    public function void(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:200']]);

        return $this->ok($this->presenter->present($this->billing->void(Invoice::findOrFail($id), $data['reason'], $request->user())), 'Bill cancelled.');
    }

    public function pdf(int $id): Response
    {
        $invoice = Invoice::findOrFail($id);
        $tenant = $this->context->require();

        return $this->presenter->pdf($invoice, $tenant->timezone, (bool) $tenant->is_demo)
            ->download(str_replace('/', '-', $invoice->number).'.pdf');
    }
}
