<?php

namespace Tests\Feature\Plans;

use App\Modules\Plans\Models\FeatureOverride;
use App\Modules\Plans\Services\FeatureService;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class FeatureGatingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // A throwaway route gated like future modules (e.g. QR ordering in Phase 4).
        Route::middleware(['api', 'auth:sanctum', 'tenant.user', 'feature:qr_ordering'])
            ->get('/api/v1/_test/qr', fn () => response()->json(['data' => 'ok']));
    }

    public function test_plans_include_the_right_features_and_limits(): void
    {
        $features = app(FeatureService::class);

        $starter = $this->business('Starter Co', 'starter');
        $this->assertTrue($features->enabled($starter, 'online_ordering'));
        $this->assertFalse($features->enabled($starter, 'qr_ordering'));
        $this->assertFalse($features->enabled($starter, 'hotel'));
        $this->assertSame(50, $features->limit($starter, 'menu_items'));
        $this->assertSame(2, $features->limit($starter, 'staff_accounts'));

        $pro = $this->business('Pro Co', 'pro');
        $this->assertTrue($features->enabled($pro, 'hotel'));
        $this->assertTrue($features->enabled($pro, 'multi_branch'));
        $this->assertNull($features->limit($pro, 'staff_accounts'));
    }

    public function test_feature_middleware_blocks_and_override_unblocks(): void
    {
        $t = $this->business('Starter Co', 'starter');
        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/_test/qr')
            ->assertForbidden()->assertJsonPath('meta.code', 'feature_unavailable')->assertJsonPath('meta.upgrade', true);

        FeatureOverride::withoutTenancy()->create(['tenant_id' => $t->id, 'feature' => 'qr_ordering', 'enabled' => true, 'reason' => 'pilot']);
        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/_test/qr')->assertOk();
    }

    public function test_expired_overrides_are_ignored(): void
    {
        $t = $this->business('Starter Co', 'starter');
        FeatureOverride::withoutTenancy()->create(['tenant_id' => $t->id, 'feature' => 'qr_ordering', 'enabled' => true, 'reason' => 'old pilot', 'expires_at' => now()->subDay()]);

        $this->assertFalse(app(FeatureService::class)->enabled($t, 'qr_ordering'));
    }

    public function test_overrides_can_also_switch_a_plan_feature_off(): void
    {
        $t = $this->business('Growth Co', 'growth');
        FeatureOverride::withoutTenancy()->create(['tenant_id' => $t->id, 'feature' => 'pos', 'enabled' => false, 'reason' => 'abuse review']);

        $this->assertFalse(app(FeatureService::class)->enabled($t, 'pos'));
    }

    public function test_staff_limit_is_enforced_on_starter(): void
    {
        $t = $this->business('Starter Co', 'starter');
        $this->actingAsUser($this->ownerOf($t));

        $this->postJson('/api/v1/tenant/staff', ['name' => 'One', 'phone' => '9811100001', 'role' => 'waiter'])->assertCreated();
        $this->postJson('/api/v1/tenant/staff', ['name' => 'Two', 'phone' => '9811100002', 'role' => 'kitchen'])->assertCreated();
        $this->postJson('/api/v1/tenant/staff', ['name' => 'Three', 'phone' => '9811100003', 'role' => 'cashier'])
            ->assertForbidden()->assertJsonPath('meta.code', 'plan_limit')->assertJsonPath('meta.max', 2);

        $this->getJson('/api/v1/tenant/staff')->assertJsonPath('meta.staff_count', 2)->assertJsonPath('meta.staff_limit', 2);
    }

    public function test_session_exposes_features_for_the_frontend(): void
    {
        $t = $this->business('Starter Co', 'starter');
        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/auth/me')
            ->assertJsonPath('data.features.qr_ordering', false)
            ->assertJsonPath('data.features.online_ordering', true)
            ->assertJsonPath('data.limits.staff_accounts', 2);
    }
}
