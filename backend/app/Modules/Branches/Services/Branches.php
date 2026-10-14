<?php

namespace App\Modules\Branches\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Support\Roles;
use App\Modules\Menu\Models\Addon;
use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Reports\Services\Analytics;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\ThemeSetting;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Multi-branch (Pro) as linked outlets: each branch is its own business (website, menu,
 * staff, orders) tied to the main one. Branches share the main business's plan and
 * subscription; its owner is owner of every branch and switches between them.
 */
class Branches
{
    public function __construct(private readonly TenantContext $context) {}

    /** The main business and its branches. @return list<Tenant> */
    public function family(Tenant $any): array
    {
        $root = $any->billingRoot();

        return [$root, ...Tenant::where('parent_tenant_id', $root->id)->orderBy('id')->get()->all()];
    }

    /** Outlets this person may switch to (where they have a role), when there is more than one. */
    public static function switchable(User $user): array
    {
        $tenant = $user->tenant;
        if (! $tenant) {
            return [];
        }
        $root = $tenant->billingRoot();
        $family = Tenant::where('id', $root->id)->orWhere('parent_tenant_id', $root->id)->orderBy('id')->get();
        if ($family->count() < 2) {
            return [];
        }
        $allowed = DB::table('model_has_roles')->where('model_type', User::class)->where('model_id', $user->id)->whereIn('tenant_id', $family->pluck('id'))->pluck('tenant_id')->all();

        return $family->filter(fn (Tenant $t) => in_array($t->id, $allowed, true))->map(fn (Tenant $t) => [
            'id' => $t->public_id, 'name' => $t->name, 'city' => $t->city, 'is_main' => $t->parent_tenant_id === null, 'current' => $t->id === $tenant->id,
        ])->values()->all();
    }

    /**
     * A new outlet: its own subdomain, the owner as its owner, optionally the main business's
     * menu, theme and settings copied in. It then goes through the usual "go live" steps.
     */
    public function create(Tenant $current, array $data, User $owner): Tenant
    {
        $root = $current->billingRoot();
        $features = app(FeatureService::class);
        $features->assertEnabled($root, 'multi_branch');
        $features->assertWithinLimit($root, 'branches', count($this->family($root)));

        $branch = DB::transaction(function () use ($root, $current, $data, $owner) {
            $branch = Tenant::create([
                'name' => strip_tags($data['name']),
                'slug' => app(CreateBusiness::class)->uniqueSlug($data['name']),
                'business_type' => $data['business_type'] ?? $root->business_type,
                'city' => strip_tags($data['city']),
                'gstin' => $data['gstin'] ?? $root->gstin,
                'timezone' => $root->timezone,
                'status' => 'onboarding',
                'onboarding_step' => 4,
                'plan_id' => $root->plan_id,
                'parent_tenant_id' => $root->id,
                'is_demo' => $root->is_demo,
            ]);
            TenantDomain::create(['tenant_id' => $branch->id, 'domain' => TenantResolver::subdomainFor($branch->slug), 'type' => 'subdomain', 'is_primary' => true, 'verified_at' => now()]);

            // Settings worth starting from (never payment keys: each outlet connects its own).
            $copy = $this->context->run($current, fn () => [
                'settings' => array_intersect_key(app(TenantSettings::class)->all(), array_flip(['opening_hours', 'site_content', OrderingSettings::KEY, 'reservations', 'holidays'])),
                'theme' => ThemeSetting::current()->only(['theme', 'primary_color', 'accent_color', 'sections']),
            ]);
            $this->context->run($branch, function () use ($owner, $copy, $data) {
                $owner->assignRole(Roles::OWNER);
                foreach ($copy['settings'] as $key => $value) {
                    app(TenantSettings::class)->set($key, $value);
                }
                if (! empty($data['copy_theme'])) {
                    ThemeSetting::current()->update($copy['theme']);
                } else {
                    ThemeSetting::current();
                }
            });
            AuditLog::record('branch.created', $branch, ['main' => $root->public_id, 'by' => $owner->email], $root->id);

            return $branch;
        });
        if (! empty($data['copy_menu'])) {
            $this->copyMenu($current, $branch);
        }

        return $branch->fresh();
    }

    public function switchTo(User $user, Tenant $target): void
    {
        $tenant = $user->tenant;
        if (! $tenant || $target->billingRoot()->id !== $tenant->billingRoot()->id) {
            throw new ApiException('That outlet is not part of your business.', 404, 'not_found');
        }
        $hasRole = DB::table('model_has_roles')->where('model_type', User::class)->where('model_id', $user->id)->where('tenant_id', $target->id)->exists();
        if (! $hasRole) {
            throw new ApiException('You don\'t have access to that outlet.', 403, 'forbidden');
        }
        $user->forceFill(['tenant_id' => $target->id])->save();
        AuditLog::record('branch.switched', $target, ['user' => $user->email], $target->id);
    }

    /**
     * Copy the menu (categories, dishes, sizes, extras and photos) into another outlet.
     * Only into an outlet without dishes yet, so nothing there is overwritten.
     */
    public function copyMenu(Tenant $from, Tenant $to): int
    {
        if ($this->context->run($to, fn () => MenuItem::exists())) {
            throw new ApiException('That outlet already has dishes. Copy only into an outlet with an empty menu.', 422, 'menu_not_empty');
        }
        $source = $this->context->run($from, fn () => [
            'categories' => MenuCategory::orderBy('sort_order')->get(),
            'items' => MenuItem::with(['variants', 'addonGroups'])->orderBy('sort_order')->get(),
            'groups' => AddonGroup::with('addons')->orderBy('sort_order')->get(),
        ]);

        return $this->context->run($to, function () use ($source, $to) {
            return DB::transaction(function () use ($source, $to) {
                $groupIds = [];
                foreach ($source['groups'] as $g) {
                    $new = AddonGroup::create($g->only(['name', 'name_hi', 'translations', 'min_select', 'max_select', 'sort_order', 'is_demo']));
                    foreach ($g->addons as $a) {
                        Addon::create(['addon_group_id' => $new->id] + $a->only(['name', 'name_hi', 'translations', 'price', 'food_type', 'is_available', 'sort_order']));
                    }
                    $groupIds[$g->id] = $new->id;
                }
                $catIds = [];
                foreach ($source['categories'] as $c) {
                    $catIds[$c->id] = MenuCategory::create($c->only(['name', 'name_hi', 'translations', 'slug', 'tax_rate', 'sort_order', 'is_active', 'is_demo']))->id;
                }
                $count = 0;
                foreach ($source['items'] as $i) {
                    $item = MenuItem::create(['menu_category_id' => $catIds[$i->menu_category_id], 'image' => $this->copyImage($i->image, $to)] + $i->only([
                        'name', 'name_hi', 'description', 'description_hi', 'translations', 'price', 'tax_rate', 'food_type', 'spice_level', 'allergens',
                        'is_available', 'is_bestseller', 'is_chefs_special', 'sort_order', 'is_demo',
                    ]));
                    foreach ($i->variants as $v) {
                        ItemVariant::create(['menu_item_id' => $item->id] + $v->only(['name', 'name_hi', 'translations', 'price', 'is_default', 'is_available', 'sort_order']));
                    }
                    foreach ($i->addonGroups as $g) {
                        $item->addonGroups()->attach($groupIds[$g->id], ['tenant_id' => $to->id, 'sort_order' => $g->pivot->sort_order]);
                    }
                    $count++;
                }

                return $count;
            });
        });
    }

    /** Totals for every outlet over a period, and all together. */
    public function report(Tenant $any, string $from, string $to): array
    {
        $rows = [];
        foreach ($this->family($any) as $t) {
            $o = $this->context->run($t, fn () => app(Analytics::class)->overview($t, $from, $to, 'day'));
            $rows[] = ['id' => $t->public_id, 'name' => $t->name, 'city' => $t->city, 'is_main' => $t->parent_tenant_id === null, 'status' => $t->status, 'totals' => $o['totals']];
        }
        $sum = fn (string $k) => round(array_sum(array_map(fn ($r) => (float) $r['totals'][$k], $rows)), 2);
        $orders = array_sum(array_map(fn ($r) => (int) $r['totals']['orders'], $rows));

        return [
            'from' => $from,
            'to' => $to,
            'outlets' => $rows,
            'total' => ['orders' => $orders, 'sales' => number_format($sum('sales'), 2, '.', ''), 'gst' => number_format($sum('gst'), 2, '.', ''), 'average' => $orders ? number_format($sum('sales') / $orders, 2, '.', '') : '0.00'],
        ];
    }

    /** Photos are copied, so removing one in an outlet never breaks the other. */
    private function copyImage(?array $stored, Tenant $to): ?array
    {
        if (! $stored || empty($stored['path'])) {
            return $stored;
        }
        $disk = Storage::disk('public');
        $base = "tenants/{$to->public_id}/menu/".Str::lower((string) Str::ulid());
        foreach ($disk->files(dirname($stored['path'])) as $file) {
            if (str_starts_with($file, $stored['path'].'-')) {
                $disk->copy($file, $base.substr($file, strlen($stored['path'])));
            }
        }

        return ['path' => $base] + $stored;
    }
}
