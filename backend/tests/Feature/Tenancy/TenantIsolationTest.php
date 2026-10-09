<?php

namespace Tests\Feature\Tenancy;

use App\Modules\Plans\Models\FeatureOverride;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Settings\Models\Setting;
use App\Modules\Tenancy\Support\TenantContext;
use LogicException;
use Tests\TestCase;

/**
 * The most important guarantee of the platform: business A can never read or
 * write business B's data — not through the ORM, not through the API.
 */
class TenantIsolationTest extends TestCase
{
    // ---- ORM level (global scope) ----

    public function test_scoped_models_only_see_the_current_tenant(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');
        $context = app(TenantContext::class);

        $context->run($a, fn () => Setting::create(['key' => 'secret', 'value' => 'alpha-only']));
        $context->run($b, fn () => Setting::create(['key' => 'secret', 'value' => 'beta-only']));

        $this->assertSame('alpha-only', $context->run($a, fn () => Setting::where('key', 'secret')->value('value')));
        $this->assertSame('beta-only', $context->run($b, fn () => Setting::where('key', 'secret')->value('value')));
        $this->assertSame(1, $context->run($a, fn () => Setting::where('key', 'secret')->count()));

        // Even a direct id lookup from the wrong tenant finds nothing.
        $betaRowId = Setting::withoutTenancy()->where('tenant_id', $b->id)->where('key', 'secret')->value('id');
        $this->assertNull($context->run($a, fn () => Setting::find($betaRowId)));
    }

    public function test_without_a_tenant_in_context_queries_fail_closed(): void
    {
        $a = $this->business('Alpha Cafe');
        app(TenantContext::class)->run($a, fn () => Setting::create(['key' => 'x', 'value' => 1]));

        $this->assertSame(0, Setting::count());
        $this->assertSame(0, Subscription::count());
        $this->assertGreaterThan(0, Setting::withoutTenancy()->count()); // explicit opt-out only
    }

    public function test_creating_without_tenant_context_is_refused(): void
    {
        $this->expectException(LogicException::class);
        Setting::create(['key' => 'orphan', 'value' => 1]);
    }

    public function test_tenant_id_cannot_be_moved_to_another_business(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');

        $this->expectException(LogicException::class);
        app(TenantContext::class)->run($a, function () use ($b) {
            $row = Setting::create(['key' => 'k', 'value' => 1]);
            $row->update(['tenant_id' => $b->id]);
        });
    }

    // ---- API level ----

    public function test_staff_lists_never_include_another_business(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');
        $this->staff($b, 'waiter', ['name' => 'Beta Waiter']);

        $names = $this->actingAsUser($this->ownerOf($a))->getJson('/api/v1/tenant/staff')->assertOk()->json('data.*.name');

        $this->assertNotContains('Beta Waiter', $names);
        $this->assertNotContains('Beta Dhaba Owner', $names);
    }

    public function test_cannot_update_or_remove_staff_of_another_business(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');
        $betaWaiter = $this->staff($b, 'waiter', ['name' => 'Beta Waiter']);

        $this->actingAsUser($this->ownerOf($a));
        $this->patchJson("/api/v1/tenant/staff/{$betaWaiter->id}", ['role' => 'manager'])->assertNotFound();
        $this->deleteJson("/api/v1/tenant/staff/{$betaWaiter->id}")->assertNotFound();

        $this->assertDatabaseHas('users', ['id' => $betaWaiter->id, 'tenant_id' => $b->id]);
        $this->assertSame('waiter', $betaWaiter->fresh()->tenantRole());
    }

    public function test_business_settings_are_per_tenant(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');

        $this->actingAsUser($this->ownerOf($a))
            ->putJson('/api/v1/tenant/business', ['city' => 'Udaipur'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Alpha Cafe');

        $this->assertSame('Pune', $b->fresh()->city);
        $this->actingAsUser($this->ownerOf($b))->getJson('/api/v1/tenant/business')->assertJsonPath('data.name', 'Beta Dhaba');
    }

    public function test_a_token_cannot_act_from_another_business_host(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');

        $this->actingAsUser($this->ownerOf($a))
            ->withHeader('X-Tenant-Host', $this->host($b))
            ->getJson('/api/v1/tenant/staff')
            ->assertForbidden()
            ->assertJsonPath('meta.code', 'tenant_mismatch');
    }

    public function test_public_site_resolves_the_tenant_from_the_host(): void
    {
        $a = $this->business('Alpha Cafe');
        $b = $this->business('Beta Dhaba');

        $this->withHeader('X-Tenant-Host', $this->host($a).':5173')->getJson('/api/v1/site')->assertOk()->assertJsonPath('data.name', 'Alpha Cafe');
        $this->withHeader('X-Tenant-Host', $this->host($b))->getJson('/api/v1/site')->assertOk()->assertJsonPath('data.name', 'Beta Dhaba');
        $this->withHeader('X-Tenant-Host', 'dinedesk.test')->getJson('/api/v1/site')->assertNotFound();
        $this->withHeader('X-Tenant-Host', 'nobody.dinedesk.test')->getJson('/api/v1/site')->assertNotFound();
        $this->withHeader('X-Tenant-Host', 'unverified-custom.com')->getJson('/api/v1/site')->assertNotFound();
    }

    public function test_feature_overrides_do_not_leak_between_tenants(): void
    {
        $a = $this->business('Alpha Cafe', 'starter');
        $b = $this->business('Beta Dhaba', 'starter');
        FeatureOverride::withoutTenancy()->create(['tenant_id' => $a->id, 'feature' => 'qr_ordering', 'enabled' => true, 'reason' => 'pilot']);

        $features = app(FeatureService::class);
        $this->assertTrue($features->enabled($a->fresh(), 'qr_ordering'));
        $this->assertFalse($features->enabled($b->fresh(), 'qr_ordering'));
    }

    public function test_platform_reads_tenant_relations_explicitly(): void
    {
        // Regression: relations on Tenant must not be blanked by the scope when
        // the super admin (no tenant context) loads them.
        $a = $this->business('Alpha Cafe');
        $this->assertFalse(app(TenantContext::class)->check());
        $this->assertSame('trialing', $a->fresh()->currentSubscription?->status);
        $this->assertCount(1, $a->fresh()->subscriptions);
    }
}
