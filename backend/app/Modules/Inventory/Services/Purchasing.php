<?php

namespace App\Modules\Inventory\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Inventory\Models\PurchaseOrder;
use App\Modules\Inventory\Models\PurchaseOrderLine;
use App\Modules\Ordering\Support\Money;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

/**
 * Purchase orders: drafted (or suggested from low stock), sent to the supplier on WhatsApp by
 * the owner, then received: what actually arrived goes into stock at the price paid.
 */
class Purchasing
{
    public function __construct(private readonly Stock $stock) {}

    /** Items at or below their low-stock level, with a quantity that brings them to twice the level. */
    public function suggestions(): array
    {
        return InventoryItem::where('is_active', true)->where('low_stock_level', '>', 0)->whereColumn('stock', '<=', 'low_stock_level')->orderBy('name')->get()
            ->map(fn (InventoryItem $i) => [
                'inventory_item_id' => $i->id,
                'name' => $i->name,
                'unit' => $i->unit,
                'stock' => $i->stock,
                'quantity' => round(max(0.001, 2 * (float) $i->low_stock_level - (float) $i->stock), 3),
                'unit_cost' => $i->cost_per_unit,
            ])->values()->all();
    }

    /** @param  list<array{inventory_item_id: int, quantity: float, unit_cost: ?float}>  $lines */
    public function save(?PurchaseOrder $po, int $supplierId, array $lines, ?string $expectedOn, ?string $notes, User $by): PurchaseOrder
    {
        if ($po && $po->status !== 'draft') {
            throw new ApiException('Only a draft purchase order can be changed.', 422, 'not_draft');
        }

        return DB::transaction(function () use ($po, $supplierId, $lines, $expectedOn, $notes, $by) {
            $attrs = ['supplier_id' => $supplierId, 'expected_on' => $expectedOn, 'notes' => $notes ? strip_tags($notes) : null];
            if (! $po) {
                $attrs += ['number' => (int) PurchaseOrder::lockForUpdate()->max('number') + 1, 'status' => 'draft', 'created_by' => $by->id];
                $po = PurchaseOrder::create($attrs);
            } else {
                $po->update($attrs);
                $po->lines()->delete();
            }
            $total = 0;
            foreach ($lines as $l) {
                $po->lines()->create(['inventory_item_id' => $l['inventory_item_id'], 'quantity' => $l['quantity'], 'unit_cost' => $l['unit_cost'] ?? null]);
                $total += (int) round((float) $l['quantity'] * Money::toPaise($l['unit_cost'] ?? 0));
            }
            $po->update(['total' => Money::toRupees($total)]);

            return $po->fresh(['lines.item', 'supplier']);
        });
    }

    public function markSent(PurchaseOrder $po): PurchaseOrder
    {
        if (! in_array($po->status, ['draft', 'sent'], true)) {
            throw new ApiException('This purchase order was already received or cancelled.', 422, 'closed');
        }
        $po->update(['status' => 'sent', 'sent_at' => $po->sent_at ?? now()]);

        return $po;
    }

    /**
     * What arrived goes into stock as a purchase at the price paid (which becomes the item's cost).
     *
     * @param  array<int, array{received: float, unit_cost: ?float}>  $received  by line id
     */
    public function receive(PurchaseOrder $po, array $received, User $by): PurchaseOrder
    {
        if (! in_array($po->status, ['draft', 'sent'], true)) {
            throw new ApiException('This purchase order was already received or cancelled.', 422, 'closed');
        }

        return DB::transaction(function () use ($po, $received, $by) {
            $total = 0;
            foreach ($po->lines()->with('item')->get() as $line) {
                /** @var PurchaseOrderLine $line */
                $got = $received[$line->id] ?? ['received' => (float) $line->quantity, 'unit_cost' => $line->unit_cost];
                $qty = round(max(0, (float) $got['received']), 3);
                $cost = $got['unit_cost'] ?? $line->unit_cost;
                $line->update(['received_quantity' => $qty, 'unit_cost' => $cost]);
                if ($qty > 0) {
                    $this->stock->move($line->item, 'purchase', $qty, $po->code(), $by->id, $cost !== null ? (float) $cost : null);
                }
                $total += (int) round($qty * Money::toPaise($cost ?? 0));
            }
            $po->update(['status' => 'received', 'received_at' => now(), 'total' => Money::toRupees($total)]);
            AuditLog::record('purchase_order.received', $po, ['number' => $po->code(), 'total' => $po->total]);

            return $po->fresh(['lines.item', 'supplier']);
        });
    }

    /** Text for the supplier (sent from the owner's own WhatsApp). */
    public function message(PurchaseOrder $po, string $business): string
    {
        $po->loadMissing('lines.item');
        $lines = $po->lines->map(fn ($l) => '• '.$l->item->name.': '.rtrim(rtrim(number_format((float) $l->quantity, 3, '.', ''), '0'), '.').' '.$l->item->unit)->implode("\n");
        $when = $po->expected_on ? "\nNeeded by: ".$po->expected_on->format('j M Y') : '';

        return "Purchase order {$po->code()} from {$business}\n\n{$lines}{$when}".($po->notes ? "\n\n{$po->notes}" : '')."\n\nPlease confirm. Thank you!";
    }
}
