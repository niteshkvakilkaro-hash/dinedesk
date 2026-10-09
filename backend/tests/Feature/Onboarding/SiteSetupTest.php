<?php

namespace Tests\Feature\Onboarding;

use App\Modules\Tenancy\Models\Tenant;
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

        $this->putJson('/api/v1/onboarding/branding', ['primary_color' => '#FFFF00', 'tagline' => 'Chaat, done right'])
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
