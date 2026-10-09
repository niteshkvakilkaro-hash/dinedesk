<?php

namespace Tests\Feature\Menu;

use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MenuManagementTest extends TestCase
{
    private function dish(int $categoryId, array $overrides = []): array
    {
        return $overrides + [
            'category_id' => $categoryId,
            'name' => 'Dal Makhani',
            'name_hi' => 'दाल मखनी',
            'description' => 'Slow-cooked black lentils',
            'price' => 220,
            'tax_rate' => null,
            'food_type' => 'veg',
            'spice_level' => 1,
            'allergens' => ['dairy'],
            'is_available' => true,
            'is_bestseller' => false,
            'is_chefs_special' => false,
            'variants' => [],
            'addon_group_ids' => [],
        ];
    }

    public function test_owner_manages_sections_dishes_variants_and_addons(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));

        $catId = $this->postJson('/api/v1/tenant/menu/categories', ['name' => 'Mains', 'name_hi' => 'मेन', 'tax_rate' => '5', 'is_active' => true])
            ->assertCreated()->json('data.categories.0.id');
        $groupId = $this->postJson('/api/v1/tenant/menu/addon-groups', [
            'name' => 'Extras', 'min_select' => 0, 'max_select' => 2,
            'addons' => [['name' => 'Extra butter', 'price' => 20, 'food_type' => 'veg', 'is_available' => true]],
        ])->assertCreated()->json('data.addon_groups.0.id');

        $item = $this->postJson('/api/v1/tenant/menu/items', $this->dish($catId, [
            'price' => null,
            'variants' => [['name' => 'Half', 'price' => 180, 'is_available' => true], ['name' => 'Full', 'price' => 260, 'is_available' => true]],
            'addon_group_ids' => [$groupId],
        ]))->assertCreated()
            ->assertJsonPath('data.price', '180.00') // "from" the cheapest variant
            ->assertJsonCount(2, 'data.variants')
            ->assertJsonPath('data.addon_group_ids', [$groupId])
            ->json('data');

        // Edit: change a variant price (audited), drop the other.
        $this->putJson("/api/v1/tenant/menu/items/{$item['id']}", $this->dish($catId, [
            'price' => null,
            'variants' => [['id' => $item['variants'][1]['id'], 'name' => 'Full', 'price' => 280, 'is_available' => true]],
        ]))->assertOk()->assertJsonCount(1, 'data.variants')->assertJsonPath('data.price', '280.00')->assertJsonPath('data.addon_group_ids', []);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action' => 'menu.price_changed']);

        $this->patchJson("/api/v1/tenant/menu/items/{$item['id']}/availability", ['is_available' => false])->assertOk()->assertJsonPath('data.is_available', false);
        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($tenant)])->assertOk()->assertJsonPath('data.0.items.0.is_available', false);

        $this->deleteJson("/api/v1/tenant/menu/categories/{$catId}")->assertStatus(422)->assertJsonPath('meta.code', 'category_not_empty');
        $this->deleteJson("/api/v1/tenant/menu/items/{$item['id']}")->assertOk();
        $this->deleteJson("/api/v1/tenant/menu/categories/{$catId}")->assertOk();
    }

    public function test_validation_and_permissions(): void
    {
        $tenant = $this->business();
        $other = $this->business('Other Place');
        $otherCat = app(TenantContext::class)->run($other, fn () => MenuCategory::create(['name' => 'X', 'slug' => 'x'])->id);

        $this->actingAsUser($this->staff($tenant, 'waiter'))->getJson('/api/v1/tenant/menu')->assertForbidden();
        $this->actingAsUser($this->staff($tenant, 'manager'))->getJson('/api/v1/tenant/menu')->assertOk();

        $this->actingAsUser($this->ownerOf($tenant));
        $cat = $this->postJson('/api/v1/tenant/menu/categories', ['name' => 'Mains', 'is_active' => true])->json('data.categories.0.id');
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($otherCat))->assertStatus(422)->assertJsonValidationErrors('category_id');
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat, ['price' => null]))->assertStatus(422)->assertJsonValidationErrors('price');
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat, ['tax_rate' => '7']))->assertStatus(422)->assertJsonValidationErrors('tax_rate');
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat, ['allergens' => ['glitter']]))->assertStatus(422);
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat, ['addon_group_ids' => [999]]))->assertStatus(422)->assertJsonPath('meta.code', 'invalid_ids');
        $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat, ['name' => '<b>Dal</b>']))->assertCreated()->assertJsonPath('data.name', 'Dal');
    }

    public function test_starter_plan_menu_limit(): void
    {
        $tenant = $this->business('Small Cafe', 'starter');
        app(TenantContext::class)->run($tenant, function () {
            $c = MenuCategory::create(['name' => 'All', 'slug' => 'all']);
            for ($i = 0; $i < 50; $i++) {
                MenuItem::create(['menu_category_id' => $c->id, 'name' => "Dish {$i}", 'price' => 100, 'food_type' => 'veg']);
            }
        });
        $cat = app(TenantContext::class)->run($tenant, fn () => MenuCategory::value('id'));
        $this->actingAsUser($this->ownerOf($tenant))->postJson('/api/v1/tenant/menu/items', $this->dish($cat))
            ->assertForbidden()->assertJsonPath('meta.code', 'plan_limit');
    }

    public function test_dish_photos_are_webp_and_isolated(): void
    {
        Storage::fake('public');
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));
        $cat = $this->postJson('/api/v1/tenant/menu/categories', ['name' => 'Mains', 'is_active' => true])->json('data.categories.0.id');
        $id = $this->postJson('/api/v1/tenant/menu/items', $this->dish($cat))->json('data.id');

        $this->postJson("/api/v1/tenant/menu/items/{$id}/image", ['image' => UploadedFile::fake()->create('x.gif', 10, 'image/gif')])->assertStatus(422);
        $this->postJson("/api/v1/tenant/menu/items/{$id}/image", ['image' => UploadedFile::fake()->image('dal.jpg', 1000, 750)])
            ->assertOk()->assertJsonPath('data.image.width', 1000); // 480, 960 + the source width (never upscaled)
        $this->assertNotEmpty(Storage::disk('public')->allFiles("tenants/{$tenant->public_id}/menu"));

        $this->actingAsUser($this->ownerOf($this->business('Other Place')))
            ->postJson("/api/v1/tenant/menu/items/{$id}/image", ['image' => UploadedFile::fake()->image('x.jpg', 400, 400)])->assertNotFound();
    }

    public function test_csv_import_validates_first_then_imports_all_or_nothing(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));
        $csv = fn (string $body) => UploadedFile::fake()->createWithContent('menu.csv', $body);

        $this->get('/api/v1/tenant/menu/import/template')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $bad = "category,name,price,food_type,variants,tax_rate\nStarters,Paneer Tikka,abc,veg,,\nMains,Dal,,veg,Half:180|Full,7\n,No Category,100,veg,,\n";
        $report = $this->postJson('/api/v1/tenant/menu/import', ['file' => $csv($bad), 'dry_run' => true])->assertOk()->json('data');
        $this->assertFalse($report['valid']);
        $this->assertSame([2, 3, 4], array_column($report['errors'], 'row'));
        $this->postJson('/api/v1/tenant/menu/import', ['file' => $csv($bad), 'dry_run' => false])->assertStatus(422)->assertJsonPath('meta.code', 'import_invalid');
        $this->assertSame(0, app(TenantContext::class)->run($tenant, fn () => MenuItem::count()));

        $good = "\u{FEFF}Category,Name,Name_hi,Price,Food_type,Spice_level,Variants,Allergens,Is_bestseller\nStarters,Paneer Tikka,पनीर टिक्का,280,veg,2,,dairy,yes\nMains,Dal Makhani,,,veg,1,Half:180|Full:320,,no\nstarters,Chicken Tikka,,340,non-veg,2,,,\n";
        $this->postJson('/api/v1/tenant/menu/import', ['file' => $csv($good), 'dry_run' => true])->assertOk()
            ->assertJsonPath('data.valid', true)->assertJsonPath('data.rows', 3)->assertJsonPath('data.new_categories', ['Starters', 'Mains']);
        $this->postJson('/api/v1/tenant/menu/import', ['file' => $csv($good), 'dry_run' => false])->assertOk()->assertJsonPath('meta.imported', 3);

        $menu = $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($tenant)])->json('data');
        $this->assertSame(['Starters', 'Mains'], array_column($menu, 'name'));
        $this->assertSame('non_veg', $menu[0]['items'][1]['food_type']);
        $this->assertSame(['Half', 'Full'], array_column($menu[1]['items'][0]['variants'], 'name'));
        $this->assertTrue($menu[0]['items'][0]['is_bestseller']);
    }

    public function test_clearing_the_sample_menu(): void
    {
        $tenant = $this->business();
        app(TenantContext::class)->run($tenant, fn () => SampleMenu::install('restaurant'));
        $this->actingAsUser($this->ownerOf($tenant));
        $this->getJson('/api/v1/tenant/menu')->assertJsonPath('meta.has_demo', true);
        $this->deleteJson('/api/v1/tenant/menu/demo')->assertOk()->assertJsonCount(0, 'data.categories')->assertJsonCount(0, 'data.addon_groups');
        $this->getJson('/api/v1/tenant/menu')->assertJsonPath('meta.has_demo', false);
    }
}
