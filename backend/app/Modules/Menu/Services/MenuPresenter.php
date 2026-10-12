<?php

namespace App\Modules\Menu\Services;

use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Support\Images\ImageService;

/** Shapes menu data for the dashboard and the public site (same fields, one place). */
class MenuPresenter
{
    public function __construct(private readonly ImageService $images) {}

    public function item(MenuItem $i, bool $admin = false): array
    {
        $data = [
            'id' => $i->id,
            'category_id' => $i->menu_category_id,
            'name' => $i->name,
            'name_hi' => $i->name_hi,
            'description' => $i->description,
            'description_hi' => $i->description_hi,
            'price' => $i->price,
            'food_type' => $i->food_type,
            'spice_level' => $i->spice_level,
            'allergens' => $i->allergens ?? [],
            'diet_tags' => $i->diet_tags ?? [],
            'is_available' => $i->is_available,
            'is_bestseller' => $i->is_bestseller,
            'is_chefs_special' => $i->is_chefs_special,
            'image' => $this->images->present($i->image),
            'is_demo' => $i->is_demo,
            'variants' => $i->variants
                ->filter(fn ($v) => $admin || $v->is_available)
                ->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'name_hi' => $v->name_hi, 'price' => $v->price, 'is_default' => $v->is_default, 'is_available' => $v->is_available])
                ->values(),
            'addon_group_ids' => $i->addonGroups->pluck('id')->values(),
        ];
        if ($admin) {
            $data['tax_rate'] = $i->tax_rate;
            $data['sort_order'] = $i->sort_order;
        }

        return $data;
    }

    public function group(AddonGroup $g, bool $admin = false): array
    {
        return [
            'id' => $g->id,
            'name' => $g->name,
            'name_hi' => $g->name_hi,
            'min_select' => $g->min_select,
            'max_select' => $g->max_select,
            'is_demo' => $g->is_demo,
            'addons' => $g->addons
                ->filter(fn ($a) => $admin || $a->is_available)
                ->map(fn ($a) => ['id' => $a->id, 'name' => $a->name, 'name_hi' => $a->name_hi, 'price' => $a->price, 'food_type' => $a->food_type, 'is_available' => $a->is_available])
                ->values(),
            ...($admin ? ['items_count' => $g->items_count ?? null] : []),
        ];
    }

    /** Dashboard: everything, including hidden categories and unavailable dishes. */
    public function admin(): array
    {
        $categories = MenuCategory::with(['items.variants', 'items.addonGroups'])->orderBy('sort_order')->orderBy('id')->get();

        return [
            'categories' => $categories->map(fn (MenuCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'name_hi' => $c->name_hi,
                'slug' => $c->slug,
                'tax_rate' => $c->tax_rate,
                'is_active' => $c->is_active,
                'is_demo' => $c->is_demo,
                'items' => $c->items->map(fn ($i) => $this->item($i, true))->values(),
            ])->values(),
            'addon_groups' => AddonGroup::with('addons')->withCount('items')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn ($g) => $this->group($g, true))->values(),
        ];
    }

    /** Public site: active categories, with their dishes, variants and add-on groups. */
    public function public(): array
    {
        $categories = MenuCategory::where('is_active', true)
            ->with(['items.variants', 'items.addonGroups'])
            ->orderBy('sort_order')->orderBy('id')->get()
            ->filter(fn ($c) => $c->items->isNotEmpty());
        $groupIds = $categories->flatMap(fn ($c) => $c->items->flatMap(fn ($i) => $i->addonGroups->pluck('id')))->unique();

        return [
            'categories' => $categories->map(fn (MenuCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'name_hi' => $c->name_hi,
                'slug' => $c->slug,
                'is_demo' => $c->is_demo,
                'items' => $c->items->map(fn ($i) => $this->item($i))->values(),
            ])->values()->all(),
            'addon_groups' => AddonGroup::with('addons')->whereIn('id', $groupIds)->get()->map(fn ($g) => $this->group($g))->values()->all(),
        ];
    }
}
