<?php

namespace App\Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Inventory\Models\Recipe;
use App\Modules\Inventory\Models\StockMovement;
use App\Modules\Inventory\Services\Stock;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Dashboard → Inventory: raw materials, stock in / out, recipes, low stock. */
class InventoryController extends Controller
{
    public const UNITS = ['kg', 'g', 'l', 'ml', 'pcs'];

    public function __construct(private readonly TenantContext $context, private readonly Stock $stock) {}

    public function index(): JsonResponse
    {
        $items = InventoryItem::orderBy('name')->get();
        $used = Recipe::selectRaw('inventory_item_id, COUNT(DISTINCT menu_item_id) as dishes')->groupBy('inventory_item_id')->pluck('dishes', 'inventory_item_id');

        return $this->ok([
            'items' => $items->map(fn (InventoryItem $i) => $this->item($i) + ['dishes' => (int) ($used[$i->id] ?? 0)])->values(),
            'low' => $items->filter(fn (InventoryItem $i) => $i->is_active && (float) $i->low_stock_level > 0 && $i->isLow())->count(),
            'value' => number_format($items->sum(fn ($i) => max(0, (float) $i->stock) * (float) ($i->cost_per_unit ?? 0)), 2, '.', ''),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $opening = (float) ($data['stock'] ?? 0);
        unset($data['stock']);
        $item = InventoryItem::create($data + ['stock' => 0]);
        if ($opening != 0) {
            $this->stock->move($item, 'adjust', $opening, 'Opening stock', $request->user()->id);
        }

        return $this->created($this->item($item->fresh()), 'Item added.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $item = InventoryItem::findOrFail($id);
        $data = $this->validated($request, $item->id);
        unset($data['stock']);
        $item->update($data);

        return $this->ok($this->item($item), 'Saved.');
    }

    public function destroy(int $id): JsonResponse
    {
        $item = InventoryItem::findOrFail($id);
        if (Recipe::where('inventory_item_id', $id)->exists()) {
            throw new ApiException('This item is used in recipes. Remove it from them (or switch it off) first.', 422, 'in_use');
        }
        $item->delete();

        return $this->ok(null, 'Item removed.');
    }

    /** Stock in (purchase), out (wastage) or a count correction. */
    public function move(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['purchase', 'wastage', 'count'])],
            'quantity' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'unit_cost' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $item = InventoryItem::findOrFail($id);
        $qty = (float) $data['quantity'];
        [$type, $delta] = match ($data['type']) {
            'purchase' => ['purchase', $qty],
            'wastage' => ['wastage', -$qty],
            // A physical count sets the stock to what was counted.
            'count' => ['adjust', round($qty - (float) $item->stock, 3)],
        };
        if ($delta == 0 && $type !== 'adjust') {
            throw new ApiException('Enter a quantity.', 422, 'quantity', ['field' => 'quantity']);
        }
        $this->stock->move($item, $type, $delta, $data['note'] ?? ($data['type'] === 'count' ? 'Stock count' : null), $request->user()->id, isset($data['unit_cost']) ? (float) $data['unit_cost'] : null);

        return $this->ok($this->item($item->fresh()), 'Stock updated.');
    }

    public function movements(int $id): JsonResponse
    {
        InventoryItem::findOrFail($id);

        return $this->ok(StockMovement::where('inventory_item_id', $id)->orderByDesc('id')->limit(100)->get()->map(fn (StockMovement $m) => [
            'type' => $m->type, 'quantity' => $m->quantity, 'balance_after' => $m->balance_after, 'unit_cost' => $m->unit_cost,
            'note' => $m->note, 'order_id' => $m->order_id, 'at' => $m->created_at->toIso8601String(),
        ])->values());
    }

    /** The menu with each dish's (and size's) recipe lines. */
    public function recipes(): JsonResponse
    {
        $recipes = Recipe::get()->groupBy('menu_item_id');

        return $this->ok(MenuCategory::with(['items' => fn ($q) => $q->orderBy('sort_order'), 'items.variants'])->orderBy('sort_order')->get()->map(fn ($c) => [
            'id' => $c->id,
            'name' => $c->name,
            'items' => $c->items->map(fn ($i) => [
                'id' => $i->id,
                'name' => $i->name,
                'variants' => $i->variants->map(fn ($v) => ['id' => $v->id, 'name' => $v->name])->values(),
                'lines' => ($recipes[$i->id] ?? collect())->map(fn (Recipe $r) => ['inventory_item_id' => $r->inventory_item_id, 'item_variant_id' => $r->item_variant_id, 'quantity' => $r->quantity])->values(),
            ])->values(),
        ])->values());
    }

    /** Replace one dish's recipe. */
    public function saveRecipe(Request $request, int $menuItemId): JsonResponse
    {
        $tenantId = $this->context->id();
        $data = $request->validate([
            'lines' => ['present', 'array', 'max:40'],
            'lines.*.inventory_item_id' => ['required', 'integer', Rule::exists('inventory_items', 'id')->where('tenant_id', $tenantId)],
            'lines.*.item_variant_id' => ['nullable', 'integer', Rule::exists('item_variants', 'id')->where('tenant_id', $tenantId)->where('menu_item_id', $menuItemId)],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:100000'],
        ]);
        MenuItem::findOrFail($menuItemId);
        $keys = array_map(fn ($l) => ($l['item_variant_id'] ?? 0).'-'.$l['inventory_item_id'], $data['lines']);
        if (count($keys) !== count(array_unique($keys))) {
            throw new ApiException('The same ingredient is listed twice.', 422, 'duplicate');
        }
        DB::transaction(function () use ($data, $menuItemId) {
            Recipe::where('menu_item_id', $menuItemId)->delete();
            foreach ($data['lines'] as $l) {
                Recipe::create(['menu_item_id' => $menuItemId, 'item_variant_id' => $l['item_variant_id'] ?? null, 'inventory_item_id' => $l['inventory_item_id'], 'quantity' => $l['quantity']]);
            }
        });

        return $this->ok(null, 'Recipe saved.');
    }

    private function validated(Request $request, ?int $ignore = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', Rule::unique('inventory_items', 'name')->where('tenant_id', $this->context->id())->ignore($ignore)],
            'unit' => ['required', Rule::in(self::UNITS)],
            'stock' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'low_stock_level' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'cost_per_unit' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'is_active' => ['boolean'],
        ], ['name.unique' => 'You already have an item with this name.']);
        $data['name'] = strip_tags($data['name']);
        $data['low_stock_level'] ??= 0;

        return $data;
    }

    private function item(InventoryItem $i): array
    {
        return [
            'id' => $i->id, 'name' => $i->name, 'unit' => $i->unit, 'stock' => $i->stock, 'low_stock_level' => $i->low_stock_level,
            'cost_per_unit' => $i->cost_per_unit, 'is_active' => $i->is_active, 'is_low' => (float) $i->low_stock_level > 0 && $i->isLow(),
        ];
    }
}
