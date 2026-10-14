<?php

namespace Tests\Feature\Onboarding;

use App\Modules\Menu\Models\MenuItem;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\Ai\Ai;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class SiteSetupTest extends TestCase
{
    public function test_owner_walks_through_steps_four_to_seven_and_goes_live(): void
    {
        $tenant = $this->business('Spice Route');
        $owner = $this->ownerOf($tenant);
        $this->actingAsUser($owner);

        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.next', 'onboarding')->assertJsonPath('data.tenant.onboarding_step', 4);

        $this->putJson('/api/v1/onboarding/theme', ['theme' => 'disco'])->assertStatus(422);
        $this->putJson('/api/v1/onboarding/theme', ['theme' => 'street'])->assertOk()->assertJsonPath('data.tenant.onboarding_step', 5);

        $this->putJson('/api/v1/onboarding/branding', ['primary_color' => '#7A7A7A', 'tagline' => 'Chaat, done right'])
            ->assertOk()
            ->assertJsonPath('data.tenant.onboarding_step', 6)
            ->assertJsonPath('meta.warnings.0.field', 'primary_color');

        $this->postJson('/api/v1/onboarding/go-live', ['slug' => 'spice-route'])->assertStatus(409)->assertJsonPath('meta.code', 'steps_incomplete');

        $this->postJson('/api/v1/onboarding/menu', ['mode' => 'sample'])->assertOk()->assertJsonPath('data.tenant.onboarding_step', 7);
        $this->postJson('/api/v1/onboarding/menu', ['mode' => 'sample'])->assertOk(); // idempotent
        $this->assertSame(3, \App\Modules\Menu\Models\MenuCategory::withoutTenancy()->where('tenant_id', $tenant->id)->count());

        // Going back to an earlier step never moves progress backwards.
        $this->putJson('/api/v1/onboarding/theme', ['theme' => 'bistro'])->assertJsonPath('data.tenant.onboarding_step', 7);

        $this->postJson('/api/v1/onboarding/go-live', ['slug' => 'spice-route-jaipur'])
            ->assertOk()
            ->assertJsonPath('data.tenant.status', 'live')
            ->assertJsonPath('data.tenant.slug', 'spice-route-jaipur')
            ->assertJsonPath('data.tenant.site_host', 'spice-route-jaipur.dinedesk.test')
            ->assertJsonPath('data.next', 'dashboard');

        $this->getJson('/api/v1/site', ['X-Tenant-Host' => 'spice-route-jaipur.dinedesk.test'])
            ->assertOk()->assertJsonPath('data.theme.key', 'bistro')->assertJsonPath('data.content.tagline', 'Chaat, done right');
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => 'spice-route.dinedesk.test'])->assertNotFound();
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action' => 'tenant.went_live']);

        $this->postJson('/api/v1/onboarding/go-live', ['slug' => 'spice-route-jaipur'])->assertStatus(409)->assertJsonPath('meta.code', 'already_live');
    }

    public function test_owner_can_bring_their_own_menu_with_ai_at_step_six(): void
    {
        $this->app->instance(Ai::class, new class implements Ai {
            public function enabled(): bool
            {
                return true;
            }

            public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array
            {
                return ['categories' => [['name' => 'Coffee', 'items' => [
                    ['name' => 'Filter Coffee', 'description' => null, 'price' => 60, 'food_type' => 'veg', 'variants' => []],
                ]]], 'notes' => []];
            }
        });
        $tenant = $this->business('Spice Route');
        Tenant::whereKey($tenant->id)->update(['onboarding_step' => 6]);
        $this->actingAsUser($this->ownerOf($tenant));

        // Nothing added yet: the step can't be claimed as done.
        $this->postJson('/api/v1/onboarding/menu', ['mode' => 'imported'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'menu_empty')->assertJsonValidationErrors('mode');
        $this->getJson('/api/v1/auth/me')->assertJsonPath('data.tenant.onboarding_step', 6);

        // The owner, still onboarding, may use the AI reader and the CSV import it saves through.
        $this->getJson('/api/v1/tenant/menu/ai')->assertOk()->assertJsonPath('data.enabled', true);
        $rows = $this->post('/api/v1/tenant/menu/ai/read', ['files' => [UploadedFile::fake()->image('menu.jpg', 600, 900)]], ['Accept' => 'application/json'])
            ->assertOk()->json('data.rows');
        $this->assertSame('Filter Coffee', $rows[0]['name']);
        $csv = "category,name,description,price,food_type,variants\nCoffee,Filter Coffee,,60,veg,\n";
        $this->postJson('/api/v1/tenant/menu/import', ['file' => UploadedFile::fake()->createWithContent('ai-menu.csv', $csv), 'dry_run' => false])->assertOk();

        $this->postJson('/api/v1/onboarding/menu', ['mode' => 'imported'])->assertOk()->assertJsonPath('data.tenant.onboarding_step', 7);
        // Only the owner's dishes: no sample menu was added on top.
        $this->assertSame(1, MenuItem::withoutTenancy()->where('tenant_id', $tenant->id)->count());
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action' => 'onboarding.menu_imported']);

        // Another business's dishes don't count for this one; sample still works there.
        $other = $this->business('Cafe Sol');
        Tenant::whereKey($other->id)->update(['onboarding_step' => 6]);
        $this->actingAsUser($this->ownerOf($other))->postJson('/api/v1/onboarding/menu', ['mode' => 'imported'])->assertStatus(422);
        $this->postJson('/api/v1/onboarding/menu', ['mode' => 'sample'])->assertOk()->assertJsonPath('data.tenant.onboarding_step', 7);
        $this->assertTrue(MenuItem::withoutTenancy()->where('tenant_id', $other->id)->where('is_demo', true)->exists());
    }

    public function test_subdomain_rules(): void
    {
        $taken = $this->business('Cafe Sol');
        $tenant = $this->business('Spice Route');
        $this->actingAsUser($this->ownerOf($tenant));

        $check = fn (string $slug) => $this->getJson('/api/v1/onboarding/subdomain?slug='.urlencode($slug))->assertOk()->json('data');

        $this->assertTrue($check('spice-route')['available']); // its own current slug
        $this->assertTrue($check('spice-route-2')['available']);
        $this->assertFalse($check('ab')['available']);
        $this->assertFalse($check('-spice')['available']);
        $this->assertFalse($check('spice_route')['available']);
        $this->assertFalse($check('spice--route')['available']);
        $this->assertFalse($check('admin')['available']);
        $result = $check($taken->slug);
        $this->assertFalse($result['available']);
        $this->assertSame('cafe-sol-2', $result['suggestion']);

        Tenant::whereKey($tenant->id)->update(['onboarding_step' => 7]);
        $this->actingAsUser($this->ownerOf($tenant))->postJson('/api/v1/onboarding/go-live', ['slug' => 'cafe-sol'])
            ->assertStatus(422)->assertJsonValidationErrors('slug');
    }

    public function test_only_the_owner_runs_setup(): void
    {
        $tenant = $this->business();
        $manager = $this->staff($tenant, 'manager');
        $this->actingAsUser($manager)->putJson('/api/v1/onboarding/theme', ['theme' => 'street'])->assertForbidden();
        $this->actingAsUser($manager)->getJson('/api/v1/auth/me')->assertJsonPath('data.next', 'dashboard');

        $this->actingAsUser($this->user())->putJson('/api/v1/onboarding/theme', ['theme' => 'street'])
            ->assertStatus(409)->assertJsonPath('meta.code', 'onboarding_required');
    }
}
