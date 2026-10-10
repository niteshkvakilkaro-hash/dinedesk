<?php

namespace App\Modules\Tables\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Services\OrderPresenter;
use App\Modules\Ordering\Support\Money;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableRequest;
use App\Modules\Tables\Models\TableSession;
use App\Support\ApiException;
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

        return TableSession::where('dining_table_id', $table->id)->where('status', 'open')->latest('id')->first()
            ?? TableSession::create(['dining_table_id' => $table->id, 'status' => 'open', 'opened_at' => now()]);
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
        $upcoming = Reservation::with('table')->whereIn('status', ['confirmed', 'seated'])->whereNotNull('dining_table_id')
            ->where('starts_at', '<', now()->addHours(2))->where('ends_at', '>', now())->orderBy('starts_at')->get()->groupBy('dining_table_id');

        return $tables->map(function (DiningTable $t) use ($sessions, $requests, $upcoming) {
            $session = $sessions->get($t->id);
            $orders = $session ? $session->orders->filter(fn (Order $o) => $this->counts($o)) : collect();
            $reqs = $requests->get($t->id, collect());
            $state = match (true) {
                ! $t->is_active => 'inactive',
                $session && ($session->bill_requested_at || $reqs->contains('type', 'bill')) => 'bill_requested',
                (bool) $session => 'occupied',
                default => 'free',
            };
            $booking = $upcoming->get($t->id)?->first();

            return [
                'id' => $t->id,
                'label' => $t->label,
                'seats' => $t->seats,
                'area' => $t->area,
                'is_active' => $t->is_active,
                'state' => $state,
                'session' => $session ? [
                    'id' => $session->id,
                    'opened_at' => $session->opened_at->toIso8601String(),
                    'orders_count' => $orders->count(),
                    'active_orders' => $orders->filter(fn (Order $o) => $o->isActive())->count(),
                    'items_count' => (int) $orders->sum('items_sum_quantity'),
                    'total' => Money::toRupees($orders->sum(fn (Order $o) => Money::toPaise($o->total))),
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
     * Settle the bill and free the table: the table's orders are completed, pay-later
     * ones marked paid with the chosen mode, unpaid online ones released.
     */
    public function close(TableSession $session, string $mode, User $by): TableSession
    {
        if ($session->status !== 'open') {
            throw new ApiException('This table has already been closed.', 422, 'already_closed');
        }

        DB::transaction(function () use ($session, $mode, $by) {
            $session = TableSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            $total = 0;
            foreach (Order::where('table_session_id', $session->id)->lockForUpdate()->get() as $order) {
                if ($order->status === 'cancelled') {
                    continue;
                }
                if ($order->payment_method === 'online' && $order->payment_status !== 'paid') {
                    $order->update(['status' => 'cancelled', 'cancel_reason' => 'Table closed before payment']);
                    $this->event($order, 'cancelled', 'Table closed before payment', $by->id);

                    continue;
                }
                $changes = [];
                if ($order->status !== 'completed') {
                    $changes['status'] = 'completed';
                }
                if ($order->payment_status === 'unpaid') {
                    $changes['payment_status'] = 'paid';
                }
                if ($changes) {
                    $order->update($changes);
                    if (isset($changes['status'])) {
                        $this->event($order, 'completed', 'Table closed', $by->id);
                    }
                }
                $total += Money::toPaise($order->total);
            }
            $session->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $by->id, 'payment_mode' => $mode, 'total' => Money::toRupees($total)]);
            TableRequest::where('dining_table_id', $session->dining_table_id)->whereNull('resolved_at')->update(['resolved_at' => now(), 'resolved_by' => $by->id]);
            AuditLog::record('table.closed', $session, ['table_id' => $session->dining_table_id, 'total' => Money::toRupees($total), 'payment_mode' => $mode]);
        });

        return $session->fresh();
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
