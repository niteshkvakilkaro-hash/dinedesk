<?php

namespace App\Modules\Tables\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\Billing;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Services\OrderPresenter;
use App\Modules\Ordering\Support\Money;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableRequest;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Realtime\Live;
use Illuminate\Support\Facades\DB;

/**
 * QR dine-in: a table's QR opens the menu for that table. The first order opens a
 * running session that every guest at the table adds to, until staff settle the bill.
 */
class DineIn
{
    public const PAYMENT_MODES = ['cash', 'upi', 'card', 'online', 'none'];

    /** Same request type again within this window just returns the open one. */
    private const REQUEST_DEDUPE_MINUTES = 10;

    public function __construct(private readonly OrderPresenter $presenter) {}

    public function resolve(string $token): DiningTable
    {
        $table = DiningTable::where('qr_token', $token)->where('is_active', true)->first();
        if (! $table) {
            throw new ApiException('This table QR code is not active. Please ask the staff for help.', 404, 'table_not_found');
        }

        return $table;
    }

    /** The table's running session, opened if needed. Call inside a transaction. */
    public function sessionFor(DiningTable $table): TableSession
    {
        DiningTable::whereKey($table->id)->lockForUpdate()->first();
        $open = TableSession::where('dining_table_id', $table->id)->where('status', 'open')->latest('id')->first();
        if ($open) {
            return $open;
        }
        // New guests sat down: the table is clean and in use.
        DiningTable::whereKey($table->id)->update(['cleaning_since' => null]);
        $this->emit($table->id);

        return TableSession::create(['dining_table_id' => $table->id, 'status' => 'open', 'opened_at' => now()]);
    }

    /** "Call waiter" or "Request bill" from the table. */
    public function request(DiningTable $table, string $type): TableRequest
    {
        return DB::transaction(function () use ($table, $type) {
            $session = TableSession::where('dining_table_id', $table->id)->where('status', 'open')->latest('id')->first();
            if ($type === 'bill' && ! $session) {
                throw new ApiException('There is nothing to bill at this table yet.', 422, 'no_session');
            }
            $open = TableRequest::where('dining_table_id', $table->id)->where('type', $type)->whereNull('resolved_at')
                ->where('created_at', '>', now()->subMinutes(self::REQUEST_DEDUPE_MINUTES))->first();
            if ($open) {
                return $open;
            }
            if ($type === 'bill') {
                $session->update(['bill_requested_at' => now()]);
            }
            $this->emit($table->id);

            return TableRequest::create([
                'dining_table_id' => $table->id,
                'table_session_id' => $session?->id,
                'type' => $type,
                'created_at' => now(),
            ]);
        });
    }

    public function resolveRequest(TableRequest $request, User $by): void
    {
        if (! $request->resolved_at) {
            $request->update(['resolved_at' => now(), 'resolved_by' => $by->id]);
            $this->emit($request->dining_table_id);
        }
    }

    /** What guests at the table see: the running order (no other guests' names or phones). */
    public function publicView(DiningTable $table): array
    {
        $session = TableSession::with(['orders' => fn ($q) => $q->with(['items', 'events'])])
            ->where('dining_table_id', $table->id)->where('status', 'open')->latest('id')->first();
        $orders = $session ? $session->orders->filter(fn (Order $o) => $this->counts($o))->values() : collect();
        $open = TableRequest::where('dining_table_id', $table->id)->whereNull('resolved_at')
            ->where('created_at', '>', now()->subHours(2))->pluck('type')->unique()->values();

        return [
            'label' => $table->label,
            'area' => $table->area,
            'seats' => $table->seats,
            'session' => $session ? [
                'opened_at' => $session->opened_at->toIso8601String(),
                'bill_requested' => (bool) $session->bill_requested_at,
                'orders' => $orders->map(fn (Order $o) => $this->presenter->forTable($o))->values(),
                'totals' => $this->totals($orders),
            ] : null,
            'open_requests' => $open,
        ];
    }

    /** Live board for staff: every table with its state, running total and open requests. */
    public function live(): array
    {
        $tables = DiningTable::orderBy('sort_order')->orderBy('id')->get();
        $sessions = TableSession::with(['orders' => fn ($q) => $q->withSum('items', 'quantity')])->where('status', 'open')->get()->keyBy('dining_table_id');
        $requests = TableRequest::whereNull('resolved_at')->where('created_at', '>', now()->subHours(6))->orderBy('id')->get()->groupBy('dining_table_id');
        $bills = Invoice::whereIn('table_session_id', $sessions->pluck('id'))->where('status', 'unpaid')->get()->keyBy('table_session_id');
        $upcoming = Reservation::with('table')->whereIn('status', ['confirmed', 'seated'])->whereNotNull('dining_table_id')
            ->where('starts_at', '<', now()->addHours(2))->where('ends_at', '>', now())->orderBy('starts_at')->get()->groupBy('dining_table_id');

        return $tables->map(function (DiningTable $t) use ($sessions, $requests, $upcoming, $bills) {
            $session = $sessions->get($t->id);
            $orders = $session ? $session->orders->filter(fn (Order $o) => $this->counts($o)) : collect();
            $reqs = $requests->get($t->id, collect());
            $state = match (true) {
                ! $t->is_active => 'inactive',
                $session && ($session->bill_requested_at || $reqs->contains('type', 'bill')) => 'bill_requested',
                (bool) $session => 'occupied',
                (bool) $t->cleaning_since => 'cleaning',
                default => 'free',
            };
            $booking = $upcoming->get($t->id)?->first();

            return [
                'id' => $t->id,
                'label' => $t->label,
                'seats' => $t->seats,
                'area' => $t->area,
                'is_active' => $t->is_active,
                'pos_x' => $t->pos_x,
                'pos_y' => $t->pos_y,
                'shape' => $t->shape,
                'state' => $state,
                'cleaning_since' => $t->cleaning_since?->toIso8601String(),
                'session' => $session ? [
                    'id' => $session->id,
                    'opened_at' => $session->opened_at->toIso8601String(),
                    'orders_count' => $orders->count(),
                    'active_orders' => $orders->filter(fn (Order $o) => $o->isActive())->count(),
                    'items_count' => (int) $orders->sum('items_sum_quantity'),
                    'total' => Money::toRupees($orders->sum(fn (Order $o) => Money::toPaise($o->total))),
                    'invoice' => ($inv = $bills->get($session->id)) ? ['id' => $inv->id, 'number' => $inv->number, 'total' => $inv->total] : null,
                ] : null,
                'requests' => $reqs->map(fn (TableRequest $r) => ['id' => $r->id, 'type' => $r->type, 'created_at' => $r->created_at->toIso8601String()])->values(),
                'booking' => $booking ? ['code' => $booking->code, 'name' => $booking->name, 'party_size' => $booking->party_size, 'time' => $booking->time, 'status' => $booking->status] : null,
            ];
        })->values()->all();
    }

    /** The table's bill for staff: every order with its lines, and the totals. */
    public function bill(TableSession $session): array
    {
        $session->load(['orders' => fn ($q) => $q->with(['items', 'events']), 'table']);
        $orders = $session->orders->filter(fn (Order $o) => $this->counts($o))->values();

        return [
            'session_id' => $session->id,
            'table' => $session->table->label,
            'status' => $session->status,
            'opened_at' => $session->opened_at->toIso8601String(),
            'bill_requested_at' => $session->bill_requested_at?->toIso8601String(),
            'orders' => $orders->map(fn (Order $o) => $this->presenter->forTable($o) + ['customer_name' => $o->customer_name, 'id' => $o->id])->values(),
            'totals' => $this->totals($orders),
        ];
    }

    /**
     * Settle the table in one step: bill everything it ordered (or use its open bill) and
     * take the whole amount in one mode. "none" = on the house (100% discount, audited).
     * Splits, discounts and buyer GSTIN go through the POS bill screen instead.
     */
    public function close(TableSession $session, string $mode, User $by): TableSession
    {
        if ($session->status !== 'open') {
            throw new ApiException('This table has already been closed.', 422, 'already_closed');
        }
        $billing = app(Billing::class);
        $invoice = Invoice::where('table_session_id', $session->id)->where('status', 'unpaid')->first();
        if (! $invoice) {
            $orders = Order::where('table_session_id', $session->id)->get();
            $discount = $mode === 'none' ? ['type' => 'percent', 'value' => 100, 'reason' => 'No charge (on the house)'] : null;
            $invoice = $billing->bill($by->tenant, $orders, $session, $discount, null, $by);
        }
        if ($invoice->fresh()->status === 'unpaid') {
            $due = Money::toPaise($invoice->total) - Money::toPaise($invoice->fresh()->paid);
            $billing->pay($invoice, [['mode' => $mode === 'none' ? 'other' : $mode, 'amount' => Money::toRupees($due)]], $by);
        }

        return $session->fresh();
    }

    /** The table has been cleaned after guests left. */
    public function markClean(DiningTable $table): void
    {
        $table->update(['cleaning_since' => null]);
        $this->emit($table->id);
    }

    /** Guests move to another (free) table, with their running bill. */
    public function transfer(TableSession $session, DiningTable $to, User $by): TableSession
    {
        if ($session->status !== 'open') {
            throw new ApiException('This table has already been closed.', 422, 'already_closed');
        }
        if (! $to->is_active || $to->id === $session->dining_table_id) {
            throw new ApiException('Choose another table.', 422, 'invalid_table');
        }
        DB::transaction(function () use ($session, $to, $by) {
            DiningTable::whereKey([$session->dining_table_id, $to->id])->lockForUpdate()->get();
            if (TableSession::where('dining_table_id', $to->id)->where('status', 'open')->exists()) {
                throw new ApiException("{$to->label} is in use. Merge the tables instead.", 422, 'table_in_use');
            }
            $from = $session->dining_table_id;
            $session->update(['dining_table_id' => $to->id]);
            Order::where('table_session_id', $session->id)->update(['dining_table_id' => $to->id, 'table_label' => $to->label]);
            TableRequest::where('dining_table_id', $from)->whereNull('resolved_at')->update(['dining_table_id' => $to->id]);
            DiningTable::whereKey($from)->update(['cleaning_since' => now()]);
            $to->update(['cleaning_since' => null]);
            AuditLog::record('table.transferred', $session, ['from' => $from, 'to' => $to->id, 'by' => $by->id]);
            $this->emit($from);
            $this->emit($to->id);
        });

        return $session->fresh();
    }

    /** Two tables become one bill: the other table's orders join this one. */
    public function merge(TableSession $into, TableSession $other, User $by): TableSession
    {
        if ($into->status !== 'open' || $other->status !== 'open' || $into->id === $other->id) {
            throw new ApiException('Both tables must have an open bill.', 422, 'invalid_merge');
        }
        if (Invoice::whereIn('table_session_id', [$into->id, $other->id])->where('status', 'unpaid')->exists()) {
            throw new ApiException('Cancel the open bill first, then merge.', 422, 'billed');
        }
        DB::transaction(function () use ($into, $other, $by) {
            Order::where('table_session_id', $other->id)->update(['table_session_id' => $into->id]);
            TableRequest::where('table_session_id', $other->id)->whereNull('resolved_at')->update(['resolved_at' => now(), 'resolved_by' => $by->id]);
            $other->update(['status' => 'closed', 'merged_into' => $into->id, 'closed_at' => now(), 'closed_by' => $by->id, 'payment_mode' => 'merged']);
            if ($other->opened_at->lt($into->opened_at)) {
                $into->update(['opened_at' => $other->opened_at]);
            }
            DiningTable::whereKey($other->dining_table_id)->update(['cleaning_since' => now()]);
            AuditLog::record('table.merged', $into, ['into' => $into->dining_table_id, 'from' => $other->dining_table_id]);
            $this->emit($into->dining_table_id);
            $this->emit($other->dining_table_id);
        });

        return $into->fresh();
    }

    /** Floor plan: where each table stands and its shape. */
    public function saveLayout(array $positions): void
    {
        DB::transaction(function () use ($positions) {
            foreach ($positions as $p) {
                DiningTable::whereKey($p['id'])->update(['pos_x' => $p['x'], 'pos_y' => $p['y'], 'shape' => $p['shape']]);
            }
        });
        $this->emit(null);
    }

    public function emit(?int $tableId): void
    {
        $tenantId = app(TenantContext::class)->id();
        if ($tenantId) {
            Live::emit($tenantId, 'tables', 'table.changed', ['table_id' => $tableId]);
        }
    }

    /** Orders that belong on the bill (cancelled and never-paid online ones don't). */
    private function counts(Order $o): bool
    {
        return $o->status !== 'cancelled' && ! ($o->payment_method === 'online' && $o->payment_status !== 'paid');
    }

    private function totals($orders): array
    {
        $sum = fn (string $field) => Money::toRupees($orders->sum(fn (Order $o) => Money::toPaise($o->{$field})));
        $paid = $orders->filter(fn (Order $o) => $o->payment_status === 'paid');

        return [
            'subtotal' => $sum('subtotal'),
            'tax_total' => $sum('tax_total'),
            'packaging_fee' => $sum('packaging_fee'),
            'total' => $sum('total'),
            'paid' => Money::toRupees($paid->sum(fn (Order $o) => Money::toPaise($o->total))),
            'due' => Money::toRupees($orders->filter(fn (Order $o) => $o->payment_status !== 'paid')->sum(fn (Order $o) => Money::toPaise($o->total))),
            'prices_include_tax' => (bool) $orders->first()?->prices_include_tax,
        ];
    }

    private function event(Order $order, string $status, ?string $note, ?int $userId): void
    {
        OrderEvent::create(['order_id' => $order->id, 'status' => $status, 'note' => $note, 'user_id' => $userId, 'created_at' => now()]);
    }
}
