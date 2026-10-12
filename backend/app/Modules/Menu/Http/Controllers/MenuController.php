<?php

namespace App\Modules\Menu\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Menu\Services\MenuImport;
use App\Modules\Menu\Services\MenuPresenter;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Images\ImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/** Dashboard → Menu (permission menu.manage). */
class MenuController extends Controller
{
    public const TAX_RATES = ['0', '5', '12', '18', '28'];

    public function __construct(
        private readonly TenantContext $context,
        private readonly MenuPresenter $presenter,
        private readonly ImageService $images,
        private readonly FeatureService $features,
    ) {}

    public function index(): JsonResponse
    {
        $tenant = $this->context->require();

        return $this->ok($this->presenter->admin(), null, [
            'items_count' => MenuItem::count(),
            'items_limit' => $this->features->limit($tenant, 'menu_items'),
            'has_demo' => MenuItem::where('is_demo', true)->exists() || MenuCategory::where('is_demo', true)->exists(),
            'allergens' => MenuItem::ALLERGENS,
            'diets' => MenuItem::DIETS,
        ]);
    }

    /* ---------- Categories ---------- */

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate($this->categoryRules());
        $category = MenuCategory::create($this->categoryFields($data) + [
            'slug' => $this->uniqueSlug($data['name']),
            'sort_order' => (int) MenuCategory::max('sort_order') + 1,
        ]);
        AuditLog::record('menu.category_created', $category);

        return $this->created($this->presenter->admin(), 'Section added.');
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = MenuCategory::findOrFail($id);
        $data = $request->validate($this->categoryRules());
        $category->update($this->categoryFields($data) + ['is_demo' => false]);

        return $this->ok($this->presenter->admin(), 'Section saved.');
    }

    public function destroyCategory(int $id): JsonResponse
    {
        $category = MenuCategory::withCount('items')->findOrFail($id);
        if ($category->items_count > 0) {
            throw new ApiException('Move or delete the dishes in this section first.', 422, 'category_not_empty');
        }
        DB::transaction(function () use ($category) {
            // Dishes deleted earlier still point here; past orders keep their own snapshots.
            MenuItem::onlyTrashed()->where('menu_category_id', $category->id)->forceDelete();
            $category->delete();
        });
        AuditLog::record('menu.category_deleted', $category, ['name' => $category->name]);

        return $this->ok($this->presenter->admin(), 'Section deleted.');
    }

    public function reorderCategories(Request $request): JsonResponse
    {
        $this->reorder(MenuCategory::class, $request->validate(['ids' => ['required', 'array', 'max:200'], 'ids.*' => ['integer', 'distinct']])['ids']);

        return $this->ok($this->presenter->admin(), 'Order saved.');
    }

    /* ---------- Dishes ---------- */

    public function storeItem(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $this->features->assertWithinLimit($tenant, 'menu_items', MenuItem::count());
        $data = $request->validate($this->itemRules($request));

        $item = DB::transaction(function () use ($data) {
            $item = MenuItem::create($this->itemFields($data) + [
                'sort_order' => (int) MenuItem::where('menu_category_id', $data['category_id'])->max('sort_order') + 1,
            ]);
            $this->syncVariants($item, $data['variants'] ?? []);
            $this->syncGroups($item, $data['addon_group_ids'] ?? []);

            return $item;
        });
        AuditLog::record('menu.item_created', $item, ['name' => $item->name, 'price' => $item->price]);

        return $this->created($this->presenter->item($item->fresh(['variants', 'addonGroups']), true), 'Dish added.');
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $item = MenuItem::with('variants')->findOrFail($id);
        $data = $request->validate($this->itemRules($request));
        $before = ['price' => $item->price, 'variants' => $item->variants->pluck('price', 'name')->all()];

        DB::transaction(function () use ($item, $data) {
            $item->update($this->itemFields($data) + ['is_demo' => false]);
            $this->syncVariants($item, $data['variants'] ?? []);
            $this->syncGroups($item, $data['addon_group_ids'] ?? []);
        });

        $item = $item->fresh(['variants', 'addonGroups']);
        $after = ['price' => $item->price, 'variants' => $item->variants->pluck('price', 'name')->all()];
        if ($before != $after) {
            AuditLog::record('menu.price_changed', $item, ['name' => $item->name, 'from' => $before, 'to' => $after]);
        }

        return $this->ok($this->presenter->item($item, true), 'Dish saved.');
    }

    public function destroyItem(int $id): JsonResponse
    {
        $item = MenuItem::findOrFail($id);
        $this->images->delete($item->image);
        $item->update(['image' => null]);
        $item->delete();
        AuditLog::record('menu.item_deleted', $item, ['name' => $item->name]);

        return $this->ok(null, 'Dish deleted.');
    }

    /** Quick "sold out" switch, used during service. */
    public function availability(Request $request, int $id): JsonResponse
    {
        $item = MenuItem::findOrFail($id);
        $item->update($request->validate(['is_available' => ['required', 'boolean']]));

        return $this->ok($this->presenter->item($item->fresh(['variants', 'addonGroups']), true), $item->is_available ? 'Back on the menu.' : 'Marked sold out.');
    }

    public function reorderItems(Request $request, int $categoryId): JsonResponse
    {
        MenuCategory::findOrFail($categoryId);
        $ids = $request->validate(['ids' => ['required', 'array', 'max:500'], 'ids.*' => ['integer', 'distinct']])['ids'];
        if (MenuItem::where('menu_category_id', $categoryId)->whereIn('id', $ids)->count() !== count($ids)) {
            throw new ApiException('Some dishes could not be found in this section.', 422, 'invalid_ids');
        }
        $this->reorder(MenuItem::class, $ids);

        return $this->ok($this->presenter->admin(), 'Order saved.');
    }

    public function uploadImage(Request $request, int $id): JsonResponse
    {
        $item = MenuItem::findOrFail($id);
        $request->validate(['image' => ImageService::rules()], ['image.dimensions' => 'Images must be at least 200×200 pixels.']);
        $old = $item->image;
        $item->update(['image' => $this->images->store($request->file('image'), $this->context->require(), 'menu')]);
        $this->images->delete($old);

        return $this->ok($this->presenter->item($item->fresh(['variants', 'addonGroups']), true), 'Photo updated.');
    }

    public function deleteImage(int $id): JsonResponse
    {
        $item = MenuItem::findOrFail($id);
        $this->images->delete($item->image);
        $item->update(['image' => null]);

        return $this->ok($this->presenter->item($item->fresh(['variants', 'addonGroups']), true), 'Photo removed.');
    }

    /* ---------- Add-on groups ---------- */

    public function storeGroup(Request $request): JsonResponse
    {
        $data = $request->validate($this->groupRules());
        DB::transaction(function () use ($data) {
            $group = AddonGroup::create($this->groupFields($data) + ['sort_order' => (int) AddonGroup::max('sort_order') + 1]);
            $this->syncAddons($group, $data['addons']);
        });

        return $this->created($this->presenter->admin(), 'Add-on group added.');
    }

    public function updateGroup(Request $request, int $id): JsonResponse
    {
        $group = AddonGroup::findOrFail($id);
        $data = $request->validate($this->groupRules());
        DB::transaction(function () use ($group, $data) {
            $group->update($this->groupFields($data) + ['is_demo' => false]);
            $this->syncAddons($group, $data['addons']);
        });

        return $this->ok($this->presenter->admin(), 'Add-on group saved.');
    }

    public function destroyGroup(int $id): JsonResponse
    {
        AddonGroup::findOrFail($id)->delete();

        return $this->ok($this->presenter->admin(), 'Add-on group deleted.');
    }

    /* ---------- CSV import / demo ---------- */

    public function template(): Response
    {
        return response(MenuImport::template(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="dinedesk-menu-template.csv"',
        ]);
    }

    public function import(Request $request, MenuImport $import): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:2048', 'mimes:csv,txt', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel'],
            'dry_run' => ['required', 'boolean'],
        ], ['file.mimes' => 'Upload a .csv file (in Excel: File → Save As → CSV UTF-8).']);

        $tenant = $this->context->require();
        $path = $request->file('file')->getRealPath();
        $report = $import->analyse($path, $tenant);
        if (! $request->boolean('dry_run')) {
            if (! $report['valid']) {
                throw new ApiException('Fix the highlighted rows and try again. Nothing was imported.', 422, 'import_invalid', ['report' => $report]);
            }
            $count = $import->import($path);
            AuditLog::record('menu.imported', null, ['dishes' => $count, 'new_categories' => $report['new_categories']]);

            return $this->ok($this->presenter->admin(), "{$count} dishes imported.", ['imported' => $count]);
        }

        return $this->ok($report);
    }

    /** Removes everything that came from the sample menu. */
    public function clearDemo(): JsonResponse
    {
        DB::transaction(function () {
            MenuItem::where('is_demo', true)->get()->each(function ($item) {
                $this->images->delete($item->image);
                $item->forceDelete();
            });
            MenuCategory::where('is_demo', true)->whereDoesntHave('items')->get()->each(function ($category) {
                MenuItem::onlyTrashed()->where('menu_category_id', $category->id)->forceDelete();
                $category->delete();
            });
            AddonGroup::where('is_demo', true)->delete();
        });
        AuditLog::record('menu.demo_cleared');

        return $this->ok($this->presenter->admin(), 'Sample menu removed.');
    }

    /* ---------- helpers ---------- */

    private function categoryRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'name_hi' => ['nullable', 'string', 'max:100'],
            'tax_rate' => ['nullable', Rule::in(self::TAX_RATES)],
            'station' => ['nullable', 'string', 'max:30'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    private function categoryFields(array $d): array
    {
        return [
            'name' => strip_tags($d['name']),
            'name_hi' => isset($d['name_hi']) ? strip_tags($d['name_hi']) : null,
            'tax_rate' => $d['tax_rate'] ?? null,
            // Kitchen station for this section's dishes (blank = the main kitchen).
            'station' => isset($d['station']) && trim($d['station']) !== '' ? mb_substr(strip_tags(trim($d['station'])), 0, 30) : null,
            'is_active' => $d['is_active'],
        ];
    }

    private function itemRules(Request $request): array
    {
        $hasVariants = count((array) $request->input('variants', [])) > 0;

        return [
            'category_id' => ['required', 'integer', function ($attr, $value, $fail) {
                if (! MenuCategory::whereKey($value)->exists()) {
                    $fail('Choose a menu section.');
                }
            }],
            'name' => ['required', 'string', 'max:150'],
            'name_hi' => ['nullable', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:1000'],
            'description_hi' => ['nullable', 'string', 'max:1000'],
            'price' => [$hasVariants ? 'nullable' : 'required', 'numeric', 'min:0', 'max:100000'],
            'tax_rate' => ['nullable', Rule::in(self::TAX_RATES)],
            'food_type' => ['required', Rule::in(MenuItem::FOOD_TYPES)],
            'spice_level' => ['required', 'integer', 'between:0,3'],
            'allergens' => ['nullable', 'array'],
            'allergens.*' => [Rule::in(MenuItem::ALLERGENS), 'distinct'],
            'diet_tags' => ['nullable', 'array'],
            'diet_tags.*' => [Rule::in(MenuItem::DIETS), 'distinct'],
            'is_available' => ['required', 'boolean'],
            'is_bestseller' => ['required', 'boolean'],
            'is_chefs_special' => ['required', 'boolean'],
            'variants' => ['nullable', 'array', 'max:10'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.name' => ['required', 'string', 'max:60', 'distinct'],
            'variants.*.name_hi' => ['nullable', 'string', 'max:60'],
            'variants.*.price' => ['required', 'numeric', 'min:0', 'max:100000'],
            'variants.*.is_available' => ['required', 'boolean'],
            'addon_group_ids' => ['nullable', 'array', 'max:10'],
            'addon_group_ids.*' => ['integer', 'distinct'],
        ];
    }

    private function itemFields(array $d): array
    {
        $variants = $d['variants'] ?? [];
        $t = fn ($v) => $v === null || trim((string) $v) === '' ? null : strip_tags(trim((string) $v));

        return [
            'menu_category_id' => $d['category_id'],
            'name' => strip_tags($d['name']),
            'name_hi' => $t($d['name_hi'] ?? null),
            'description' => $t($d['description'] ?? null),
            'description_hi' => $t($d['description_hi'] ?? null),
            // With variants, the dish shows "from" its cheapest variant.
            'price' => $variants ? min(array_column($variants, 'price')) : $d['price'],
            'tax_rate' => $d['tax_rate'] ?? null,
            'food_type' => $d['food_type'],
            'spice_level' => $d['spice_level'],
            'allergens' => $d['allergens'] ?? [] ?: null,
            // Jain and vegan dishes are vegetarian by definition.
            'diet_tags' => $d['food_type'] === 'veg' ? ($d['diet_tags'] ?? [] ?: null) : (array_values(array_intersect($d['diet_tags'] ?? [], ['gluten_free'])) ?: null),
            'is_available' => $d['is_available'],
            'is_bestseller' => $d['is_bestseller'],
            'is_chefs_special' => $d['is_chefs_special'],
        ];
    }

    private function syncVariants(MenuItem $item, array $variants): void
    {
        $keep = [];
        foreach (array_values($variants) as $i => $v) {
            $attrs = ['name' => strip_tags($v['name']), 'name_hi' => isset($v['name_hi']) ? strip_tags($v['name_hi']) : null, 'price' => $v['price'], 'is_available' => $v['is_available'], 'is_default' => $i === 0, 'sort_order' => $i];
            $existing = ! empty($v['id']) ? $item->variants()->whereKey($v['id'])->first() : null;
            if ($existing) {
                $existing->update($attrs);
                $keep[] = $existing->id;
            } else {
                $keep[] = ItemVariant::create(['menu_item_id' => $item->id] + $attrs)->id;
            }
        }
        $item->variants()->whereNotIn('id', $keep)->delete();
    }

    private function syncGroups(MenuItem $item, array $groupIds): void
    {
        $owned = AddonGroup::whereIn('id', $groupIds)->pluck('id')->all();
        if (count($owned) !== count($groupIds)) {
            throw new ApiException('Some add-on groups could not be found.', 422, 'invalid_ids', ['field' => 'addon_group_ids']);
        }
        $item->addonGroups()->sync(collect($groupIds)->values()->mapWithKeys(fn ($id, $i) => [$id => ['tenant_id' => $item->tenant_id, 'sort_order' => $i]])->all());
    }

    private function groupRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'name_hi' => ['nullable', 'string', 'max:80'],
            'min_select' => ['required', 'integer', 'between:0,10'],
            'max_select' => ['nullable', 'integer', 'between:1,20', 'gte:min_select'],
            'addons' => ['required', 'array', 'min:1', 'max:30'],
            'addons.*.id' => ['nullable', 'integer'],
            'addons.*.name' => ['required', 'string', 'max:80', 'distinct'],
            'addons.*.name_hi' => ['nullable', 'string', 'max:80'],
            'addons.*.price' => ['required', 'numeric', 'min:0', 'max:10000'],
            'addons.*.food_type' => ['required', Rule::in(MenuItem::FOOD_TYPES)],
            'addons.*.is_available' => ['required', 'boolean'],
        ];
    }

    private function groupFields(array $d): array
    {
        return [
            'name' => strip_tags($d['name']),
            'name_hi' => isset($d['name_hi']) ? strip_tags($d['name_hi']) : null,
            'min_select' => $d['min_select'],
            'max_select' => $d['max_select'] ?? null,
        ];
    }

    private function syncAddons(AddonGroup $group, array $addons): void
    {
        $keep = [];
        foreach (array_values($addons) as $i => $a) {
            $attrs = ['name' => strip_tags($a['name']), 'name_hi' => isset($a['name_hi']) ? strip_tags($a['name_hi']) : null, 'price' => $a['price'], 'food_type' => $a['food_type'], 'is_available' => $a['is_available'], 'sort_order' => $i];
            $existing = ! empty($a['id']) ? $group->addons()->whereKey($a['id'])->first() : null;
            if ($existing) {
                $existing->update($attrs);
                $keep[] = $existing->id;
            } else {
                $keep[] = $group->addons()->create($attrs)->id;
            }
        }
        $group->addons()->whereNotIn('id', $keep)->delete();
    }

    /** @param class-string $model */
    private function reorder(string $model, array $ids): void
    {
        if ($model::whereIn('id', $ids)->count() !== count($ids)) {
            throw new ApiException('Some entries could not be found.', 422, 'invalid_ids');
        }
        DB::transaction(function () use ($model, $ids) {
            foreach ($ids as $i => $id) {
                $model::whereKey($id)->update(['sort_order' => $i + 1]);
            }
        });
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name)) ?: 'section';
        $slug = $base;
        for ($i = 2; MenuCategory::where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
