<?php

namespace Tests\Feature\Ordering;

use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Carbon\CarbonImmutable;
use Tests\TestCase;

/** A live business with a small menu, ordering switched on, at 1 pm IST on a Tuesday. */
abstract class OrderingTestCase extends TestCase
{
    protected Tenant $tenant;

    /** @var array<string, MenuItem> */
    protected array $items = [];

    protected AddonGroup $extras;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-10 13:00', 'Asia/Kolkata'));
        $this->tenant = $this->business('Spice Route', 'growth', ['status' => 'live']);
        $this->asTenant(function () {
            $mains = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'sort_order' => 1]);
            $drinks = MenuCategory::create(['name' => 'Drinks', 'slug' => 'drinks', 'tax_rate' => 18, 'sort_order' => 2]);
            $this->items['dal'] = MenuItem::create(['menu_category_id' => $mains->id, 'name' => 'Dal Makhani', 'price' => 180, 'food_type' => 'veg']);
            ItemVariant::create(['menu_item_id' => $this->items['dal']->id, 'name' => 'Half', 'price' => 180, 'is_default' => true, 'sort_order' => 0]);
            ItemVariant::create(['menu_item_id' => $this->items['dal']->id, 'name' => 'Full', 'price' => 260, 'sort_order' => 1]);
            $this->items['naan'] = MenuItem::create(['menu_category_id' => $mains->id, 'name' => 'Butter Naan', 'price' => 60, 'food_type' => 'veg']);
            $this->items['lassi'] = MenuItem::create(['menu_category_id' => $drinks->id, 'name' => 'Lassi', 'price' => 99.99, 'food_type' => 'veg']);
            $this->items['soldout'] = MenuItem::create(['menu_category_id' => $mains->id, 'name' => 'Biryani', 'price' => 300, 'food_type' => 'non_veg', 'is_available' => false]);
            $this->extras = AddonGroup::create(['name' => 'Extras', 'min_select' => 0, 'max_select' => 2]);
            $this->extras->addons()->create(['name' => 'Extra butter', 'price' => 20]);
            $this->extras->addons()->create(['name' => 'Raita', 'price' => 70]);
            $this->extras->addons()->create(['name' => 'Papad', 'price' => 30]);
            $this->items['dal']->addonGroups()->attach($this->extras->id, ['tenant_id' => $this->tenant->id, 'sort_order' => 0]);

            $s = OrderingSettings::defaults();
            $s['accepting_orders'] = true;
            $s['types'] = ['delivery' => true, 'takeaway' => true, 'dine_in' => false];
            $s['packaging_fee'] = 10;
            $s['location'] = ['lat' => 18.5204, 'lng' => 73.8567];
            app(OrderingSettings::class)->save($s);
            DeliveryZone::create(['name' => 'Kothrud', 'type' => 'pincode', 'pincodes' => ['411038'], 'fee' => 30, 'min_order' => 200, 'free_above' => 800, 'is_active' => true]);
            DeliveryZone::create(['name' => '5 km', 'type' => 'radius', 'radius_km' => 5, 'fee' => 50, 'min_order' => 300, 'is_active' => true]);
        });
    }

    protected function asTenant(callable $fn): mixed
    {
        return app(TenantContext::class)->run($this->tenant, $fn);
    }

    protected function site(): array
    {
        return ['X-Tenant-Host' => $this->host($this->tenant)];
    }

    protected function addon(string $name): int
    {
        return $this->asTenant(fn () => $this->extras->addons()->where('name', $name)->value('id'));
    }

    protected function variant(string $name): int
    {
        return $this->asTenant(fn () => ItemVariant::where('menu_item_id', $this->items['dal']->id)->where('name', $name)->value('id'));
    }

    protected function orderPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'type' => 'takeaway',
            'payment_method' => 'counter',
            'customer' => ['name' => 'Asha Verma', 'phone' => '98290 12345', 'email' => 'asha@example.com'],
            'items' => [
                ['item_id' => $this->items['dal']->id, 'variant_id' => $this->variant('Full'), 'addon_ids' => [$this->addon('Extra butter')], 'quantity' => 2],
                ['item_id' => $this->items['naan']->id, 'quantity' => 3],
            ],
        ], $overrides);
    }
}
