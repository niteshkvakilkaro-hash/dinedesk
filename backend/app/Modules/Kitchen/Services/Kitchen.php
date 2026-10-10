<?php

namespace App\Modules\Kitchen\Services;

use App\Models\User;
use App\Modules\Kitchen\Models\Kot;
use App\Modules\Kitchen\Models\KotItem;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Support\ApiException;
use App\Support\Realtime\Live;
use Illuminate\Support\Facades\DB;

/**
 * Kitchen order tickets (KOTs). Every order the kitchen should cook gets one ticket
 * when it is sent to the kitchen (pay-later orders straight away, online ones once
 * paid). The ticket and its order move together:
 *   ticket new → preparing → ready → served (bumped off the screen)
 *   order  pending/confirmed → preparing → ready
 * Changing either side (Kitchen Display or the Orders board) updates the other.
 */
class Kitchen
{
    /** Ticket status → the order status it implies. */
    private const ORDER_FOR = ['preparing' => 'preparing', 'ready' => 'ready'];

    /** Creates the ticket for an order (once). */
    public function createFor(Order $order): ?Kot
    {
        if (Kot::where('order_id', $order->id)->exists()) {
            return null;
        }
        $kot = DB::transaction(function () use ($order) {
            $last = Kot::lockForUpdate()->max('number');
            $order->loadMissing('items');
            $kot = Kot::create([
                'order_id' => $order->id,
                'number' => (int) $last + 1,
                'status' => 'new',
                'order_type' => $order->type,
                'table_label' => $order->table_label,
                'notes' => $order->notes,
            ]);
            foreach ($order->items as $item) {
                KotItem::create([
                    'kot_id' => $kot->id,
                    'order_item_id' => $item->id,
                    'name' => $item->name,
                    'variant_name' => $item->variant_name,
                    'addons' => $item->addons ? implode(', ', array_column($item->addons, 'name')) : null,
                    'food_type' => $item->food_type,
                    'quantity' => $item->quantity,
                    'notes' => $item->notes,
                ]);
            }

            return $kot;
        });
        $this->emit($kot, 'kot.created');
        // Raw materials leave the store when the kitchen gets the order.
        app(\App\Modules\Inventory\Services\Stock::class)->consume($order);

        return $kot;
    }

    /** Kitchen moves a ticket on (the order follows). */
    public function move(Kot $kot, string $to, User $by): Kot
    {
        $allowed = match ($kot->status) {
            'new' => ['preparing', 'ready'],
            'preparing' => ['ready'],
            'ready' => ['served'],
            // Bumped by mistake: bring it back.
            'served' => ['ready'],
            default => [],
        };
        if (! in_array($to, $allowed, true)) {
            throw new ApiException("A ticket that is {$kot->status} can't be marked {$to}.", 422, 'invalid_transition');
        }

        DB::transaction(function () use ($kot, $to, $by) {
            $from = $kot->status;
            $this->setStatus($kot, $to);
            if ($to === 'served' || $from === 'served') {
                return; // serving / recalling doesn't change the order
            }
            $order = Order::whereKey($kot->order_id)->first();
            if ($order && $order->isActive()) {
                $this->advanceOrder($order, self::ORDER_FOR[$to], $by);
            }
        });
        $this->emit($kot->fresh(), 'kot.changed');

        return $kot->fresh('items');
    }

    public function toggleItem(KotItem $item): KotItem
    {
        $item->update(['done' => ! $item->done]);
        $this->emit($item->kot, 'kot.changed');

        return $item;
    }

    /**
     * The order moved (Orders board, billing, cancellation): bring its ticket along.
     * Only ever moves a ticket forward, so the two sides never loop.
     */
    public function syncFromOrder(Order $order): void
    {
        $kot = Kot::where('order_id', $order->id)->first();
        if (! $kot) {
            return;
        }
        $target = match ($order->status) {
            'preparing' => 'preparing',
            'ready', 'out_for_delivery' => 'ready',
            'completed' => 'served',
            'cancelled' => 'cancelled',
            default => null,
        };
        $rank = ['new' => 0, 'preparing' => 1, 'ready' => 2, 'served' => 3, 'cancelled' => 4];
        if ($target && $rank[$target] > $rank[$kot->status]) {
            $this->setStatus($kot, $target);
            $this->emit($kot, 'kot.changed');
        }
    }

    /** Active tickets (and the last few served, to recall a mistaken bump). */
    public function board(): array
    {
        $active = Kot::with('items')->whereIn('status', Kot::ACTIVE)->orderBy('id')->get();
        $served = Kot::with('items')->where('status', 'served')->where('served_at', '>', now()->subMinutes(30))->orderByDesc('served_at')->limit(12)->get();

        return [
            'tickets' => $active->map(fn (Kot $k) => $this->present($k))->values(),
            'served' => $served->map(fn (Kot $k) => $this->present($k))->values(),
        ];
    }

    public function present(Kot $k): array
    {
        return [
            'id' => $k->id,
            'number' => $k->number,
            'order_id' => $k->order_id,
            'status' => $k->status,
            'order_type' => $k->order_type,
            'table_label' => $k->table_label,
            'notes' => $k->notes,
            'created_at' => $k->created_at->toIso8601String(),
            'started_at' => $k->started_at?->toIso8601String(),
            'ready_at' => $k->ready_at?->toIso8601String(),
            'served_at' => $k->served_at?->toIso8601String(),
            'order_number' => $k->order?->number,
            'items' => $k->items->map(fn (KotItem $i) => [
                'id' => $i->id, 'name' => $i->name, 'variant_name' => $i->variant_name, 'addons' => $i->addons,
                'food_type' => $i->food_type, 'quantity' => $i->quantity, 'notes' => $i->notes, 'done' => $i->done,
            ])->values(),
        ];
    }

    private function setStatus(Kot $kot, string $to): void
    {
        $changes = ['status' => $to];
        if ($to === 'preparing' && ! $kot->started_at) {
            $changes['started_at'] = now();
        }
        if ($to === 'ready') {
            $changes['ready_at'] ??= $kot->ready_at ?? now();
            $changes['started_at'] = $kot->started_at ?? now();
            $changes['served_at'] = null;
        }
        if ($to === 'served') {
            $changes['served_at'] = now();
        }
        $kot->update($changes);
    }

    /** Walks the order forward through the allowed steps (pending → confirmed → preparing → ready). */
    private function advanceOrder(Order $order, string $target, User $by): void
    {
        $flow = app(OrderFlow::class);
        $path = ['pending' => 'confirmed', 'confirmed' => 'preparing', 'preparing' => 'ready'];
        $guard = 0;
        while ($order->status !== $target && isset($path[$order->status]) && $guard++ < 3) {
            $order = $flow->transition($order, $path[$order->status], $by);
        }
    }

    private function emit(Kot $kot, string $name): void
    {
        Live::emit($kot->tenant_id, 'kitchen', $name, ['id' => $kot->id, 'number' => $kot->number, 'status' => $kot->status, 'table' => $kot->table_label]);
    }
}
