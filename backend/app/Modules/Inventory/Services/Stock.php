<?php

namespace App\Modules\Inventory\Services;

use App\Models\User;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Inventory\Models\Recipe;
use App\Modules\Inventory\Models\StockMovement;
use App\Modules\Inventory\Notifications\LowStockForStaff;
use App\Modules\Ordering\Models\Order;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Raw-material stock. Purchases, wastage and counts are entered by staff; sales are
 * deducted automatically from each dish's recipe when an order reaches the kitchen,
 * and put back if that order is cancelled. Stock may go below zero (the kitchen
 * cooked anyway); it then shows as low.
 */
class Stock
{
    public function __construct(private readonly TenantContext $context, private readonly FeatureService $features) {}

    public function move(InventoryItem $item, string $type, float $quantity, ?string $note, ?int $userId, ?float $unitCost = null, ?int $orderId = null): StockMovement
    {
        return DB::transaction(function () use ($item, $type, $quantity, $note, $userId, $unitCost, $orderId) {
            $item = InventoryItem::whereKey($item->id)->lockForUpdate()->first();
            $balance = round((float) $item->stock + $quantity, 3);
            $changes = ['stock' => $balance];
            if ($type === 'purchase' && $unitCost !== null) {
                $changes['cost_per_unit'] = $unitCost;
            }
            if ($balance > (float) $item->low_stock_level) {
                $changes['low_alerted_at'] = null; // back above the level: alert again next time
            }
            $item->update($changes);
            $movement = StockMovement::create([
                'inventory_item_id' => $item->id, 'type' => $type, 'quantity' => round($quantity, 3), 'balance_after' => $balance,
                'unit_cost' => $unitCost, 'order_id' => $orderId, 'note' => $note ? strip_tags($note) : null, 'user_id' => $userId, 'created_at' => now(),
            ]);
            $this->alertIfLow($item->fresh());

            return $movement;
        });
    }

    /** An order reached the kitchen: deduct every recipe line (once per order). */
    public function consume(Order $order): void
    {
        $tenant = $this->context->get();
        if (! $tenant || ! $this->features->enabled($tenant, 'inventory') || $order->stock_deducted_at) {
            return;
        }
        $order->loadMissing('items');
        $recipes = Recipe::whereIn('menu_item_id', $order->items->pluck('menu_item_id')->filter())->get();
        if ($recipes->isEmpty()) {
            return;
        }
        DB::transaction(function () use ($order, $recipes) {
            $use = [];
            foreach ($order->items as $line) {
                // A size's own recipe if it has one, otherwise the dish's.
                $own = $recipes->where('menu_item_id', $line->menu_item_id)->where('item_variant_id', $line->item_variant_id);
                $rows = $line->item_variant_id && $own->isNotEmpty() ? $own : $recipes->where('menu_item_id', $line->menu_item_id)->whereNull('item_variant_id');
                foreach ($rows as $r) {
                    $use[$r->inventory_item_id] = ($use[$r->inventory_item_id] ?? 0) + (float) $r->quantity * $line->quantity;
                }
            }
            foreach ($use as $itemId => $qty) {
                if ($item = InventoryItem::find($itemId)) {
                    $this->move($item, 'sale', -$qty, "Order #{$order->number}", null, null, $order->id);
                }
            }
            $order->forceFill(['stock_deducted_at' => now()])->saveQuietly();
        });
    }

    /** Cancelled order: put back what it took. */
    public function restore(Order $order): void
    {
        if (! $order->stock_deducted_at) {
            return;
        }
        DB::transaction(function () use ($order) {
            $sold = StockMovement::where('order_id', $order->id)->where('type', 'sale')->get()->groupBy('inventory_item_id');
            foreach ($sold as $itemId => $rows) {
                if ($item = InventoryItem::find($itemId)) {
                    $this->move($item, 'return', -$rows->sum(fn ($m) => (float) $m->quantity), "Order #{$order->number} cancelled", null, null, $order->id);
                }
            }
            $order->forceFill(['stock_deducted_at' => null])->saveQuietly();
        });
    }

    /** Tells staff who manage inventory once when an item drops to its low level. */
    private function alertIfLow(InventoryItem $item): void
    {
        if (! $item->isLow() || $item->low_alerted_at || (float) $item->low_stock_level <= 0) {
            return;
        }
        $item->update(['low_alerted_at' => now()]);
        $staff = User::where('tenant_id', $item->tenant_id)->where('status', 'active')->get()
            ->filter(fn (User $u) => in_array('inventory.manage', $u->tenantPermissions(), true));
        Notification::send($staff, new LowStockForStaff($item));
    }
}
