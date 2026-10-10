<?php

namespace Tests\Feature\Platform;

use Tests\TestCase;

class SuperAdminTest extends TestCase
{
    private function admin()
    {
        return $this->actingAsUser($this->user(['is_platform_admin' => true]));
    }

    public function test_lists_every_tenant_with_plan_status_owner_and_summary(): void
    {
        $this->business('Alpha Cafe');
        $this->business('Beta Dhaba', 'starter');

        $res = $this->admin()->getJson('/api/v1/platform/tenants')->assertOk();

        $this->assertEqualsCanonicalizing(['Alpha Cafe', 'Beta Dhaba'], $res->json('data.*.name'));
        $row = collect($res->json('data'))->firstWhere('name', 'Beta Dhaba');
        $this->assertSame('starter', $row['plan']['code']);
        $this->assertSame('trialing', $row['subscription_status']);
        $this->assertSame('Beta Dhaba Owner', $row['owner_name']);
        $this->assertEquals(0, $row['mrr']); // trials don't count
        $res->assertJsonPath('meta.summary.total', 2)->assertJsonPath('meta.summary.trialing', 2);
    }

    public function test_search_and_filters(): void
    {
        $this->business('Alpha Cafe');
        $this->business('Beta Dhaba', 'starter');

        $this->admin()->getJson('/api/v1/platform/tenants?search=beta')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Beta Dhaba');
        $this->getJson('/api/v1/platform/tenants?plan=growth')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Alpha Cafe');
        $this->getJson('/api/v1/platform/tenants?search=Alpha Cafe Owner')->assertJsonCount(0, 'data');
    }

    public function test_change_plan_and_status_requires_a_reason_and_is_audited(): void
    {
        $t = $this->business('Alpha Cafe', 'starter');

        $this->admin()->patchJson("/api/v1/platform/tenants/{$t->public_id}", ['plan' => 'pro'])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->patchJson("/api/v1/platform/tenants/{$t->public_id}", ['plan' => 'pro', 'reason' => 'Pilot for hotel module'])
            ->assertOk()->assertJsonPath('data.plan.code', 'pro')->assertJsonPath('data.features.hotel', true);

        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $t->id, 'action' => 'platform.tenant.updated']);
    }

    public function test_suspending_blocks_the_dashboard_and_the_public_site(): void
    {
        $t = $this->business('Alpha Cafe');
        $owner = $this->ownerOf($t);
        $owner->createToken('web');

        $this->admin()->patchJson("/api/v1/platform/tenants/{$t->public_id}", ['status' => 'suspended', 'reason' => 'Payment fraud review'])->assertOk();

        $this->assertSame(0, $owner->tokens()->count());
        $this->actingAsUser($owner->fresh())->getJson('/api/v1/tenant/business')->assertForbidden()->assertJsonPath('meta.code', 'tenant_suspended');
        $this->withHeader('X-Tenant-Host', $this->host($t))->getJson('/api/v1/site')->assertNotFound();
    }

    public function test_read_only_allows_viewing_but_not_writing(): void
    {
        $t = $this->business('Alpha Cafe');
        $this->admin()->patchJson("/api/v1/platform/tenants/{$t->public_id}", ['status' => 'read_only', 'reason' => 'Unpaid invoice'])->assertOk();

        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/tenant/business')->assertOk();
        $this->putJson('/api/v1/tenant/business', ['city' => 'X'])->assertForbidden()->assertJsonPath('meta.code', 'tenant_read_only');
    }

    public function test_feature_overrides_and_plan_editing(): void
    {
        $t = $this->business('Alpha Cafe', 'starter');
        $this->admin()->postJson("/api/v1/platform/tenants/{$t->public_id}/feature-overrides", ['feature' => 'qr_ordering', 'enabled' => true, 'reason' => 'Pilot customer'])
            ->assertOk()->assertJsonPath('data.features.qr_ordering', true);
        $this->postJson("/api/v1/platform/tenants/{$t->public_id}/feature-overrides", ['feature' => 'teleport', 'enabled' => true, 'reason' => 'nope'])
            ->assertStatus(422);
        $this->deleteJson("/api/v1/platform/tenants/{$t->public_id}/feature-overrides/qr_ordering")->assertOk()->assertJsonPath('data.features.qr_ordering', false);

        $this->putJson('/api/v1/platform/plans/starter', ['price_monthly' => 999, 'limits' => ['staff_accounts' => 3]])
            ->assertOk()->assertJsonPath('data.price_monthly', '999.00')->assertJsonPath('data.limits.staff_accounts', 3)->assertJsonPath('data.limits.menu_items', 50);
        $this->putJson('/api/v1/platform/plans/starter', ['features' => ['website', 'warp_drive']])->assertStatus(422);
    }

    public function test_mrr_counts_only_paying_subscriptions(): void
    {
        $t = $this->business('Alpha Cafe');
        $this->admin()->putJson('/api/v1/platform/plans/growth', ['price_monthly' => 1999, 'price_yearly' => 19990])->assertOk();
        \App\Modules\Plans\Models\Subscription::withoutTenancy()->where('tenant_id', $t->id)->update(['status' => 'active', 'billing_cycle' => 'yearly', 'provider_subscription_id' => 'sub_TEST']);

        $this->getJson('/api/v1/platform/tenants')->assertJsonPath('data.0.mrr', 1665.83)->assertJsonPath('meta.summary.mrr', 1665.83);
    }
}
