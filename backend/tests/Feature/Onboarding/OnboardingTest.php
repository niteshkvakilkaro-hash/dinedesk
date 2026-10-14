<?php

namespace Tests\Feature\Onboarding;

use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\Carbon;
use Tests\TestCase;

class OnboardingTest extends TestCase
{
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'business_type' => 'restaurant',
            'name' => 'The Hungry Haveli',
            'city' => 'Jaipur',
            'gstin' => '08abcde1234f1z5',
            'opening_hours' => OpeningHours::default(),
        ];
    }

    public function test_creates_business_with_subdomain_trial_owner_role_and_hours(): void
    {
        $owner = $this->user();
        $hours = OpeningHours::default();
        $hours['mon'] = ['closed' => true];

        $res = $this->actingAsUser($owner)->postJson('/api/v1/onboarding/business', $this->payload(['opening_hours' => $hours]))
            ->assertCreated()
            ->assertJsonPath('data.tenant.slug', 'the-hungry-haveli')
            ->assertJsonPath('data.tenant.site_host', 'the-hungry-haveli.dinedesk.test')
            ->assertJsonPath('data.tenant.status', 'onboarding')
            ->assertJsonPath('data.tenant.plan.code', 'growth')
            ->assertJsonPath('data.tenant.subscription.status', 'trialing')
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.next', 'onboarding');

        $tenant = Tenant::where('slug', 'the-hungry-haveli')->firstOrFail();
        $this->assertSame('08ABCDE1234F1Z5', $tenant->gstin);
        $this->assertSame($tenant->id, $owner->fresh()->tenant_id);
        $this->assertDatabaseHas('tenant_domains', ['tenant_id' => $tenant->id, 'domain' => 'the-hungry-haveli.dinedesk.test', 'is_primary' => true]);
        $trialEnds = Carbon::parse($res->json('data.tenant.subscription.trial_ends_at'));
        $this->assertEqualsWithDelta(14, now()->diffInDays($trialEnds), 0.01);

        $this->withHeader('X-Tenant-Host', 'the-hungry-haveli.dinedesk.test')->getJson('/api/v1/site')
            ->assertJsonPath('data.opening_hours.mon.closed', true);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action' => 'tenant.created']);
    }

    public function test_cannot_create_a_second_business(): void
    {
        $owner = $this->user();
        $this->actingAsUser($owner)->postJson('/api/v1/onboarding/business', $this->payload())->assertCreated();
        $this->actingAsUser($owner->fresh())->postJson('/api/v1/onboarding/business', $this->payload(['name' => 'Another']))
            ->assertStatus(409)->assertJsonPath('meta.code', 'already_onboarded');
    }

    public function test_slugs_are_unique_and_avoid_reserved_words(): void
    {
        $this->actingAsUser($this->user())->postJson('/api/v1/onboarding/business', $this->payload(['name' => 'Spice Route']))->assertCreated();
        $this->actingAsUser($this->user())->postJson('/api/v1/onboarding/business', $this->payload(['name' => 'Spice Route']))
            ->assertCreated()->assertJsonPath('data.tenant.slug', 'spice-route-2');

        $slug = $this->actingAsUser($this->user())->postJson('/api/v1/onboarding/business', $this->payload(['name' => 'Admin']))
            ->assertCreated()->json('data.tenant.slug');
        $this->assertNotSame('admin', $slug);
        $this->assertStringStartsWith('admin-', $slug);
    }

    public function test_validation(): void
    {
        $this->actingAsUser($this->user());

        $this->postJson('/api/v1/onboarding/business', $this->payload(['gstin' => 'NOTAGSTIN']))
            ->assertStatus(422)->assertJsonValidationErrors('gstin');
        $this->postJson('/api/v1/onboarding/business', $this->payload(['business_type' => 'spaceship']))
            ->assertStatus(422)->assertJsonValidationErrors('business_type');

        $hours = OpeningHours::default();
        $hours['tue'] = ['closed' => false, 'open' => '25:00', 'close' => '23:00'];
        $this->postJson('/api/v1/onboarding/business', $this->payload(['opening_hours' => $hours]))
            ->assertStatus(422)->assertJsonValidationErrors('opening_hours.tue.open');

        // GSTIN is optional.
        $this->postJson('/api/v1/onboarding/business', $this->payload(['gstin' => null]))->assertCreated();
    }

    public function test_tenant_routes_ask_to_finish_onboarding_first(): void
    {
        $this->actingAsUser($this->user())->getJson('/api/v1/tenant/staff')
            ->assertStatus(409)->assertJsonPath('meta.code', 'onboarding_required');
    }

    public function test_platform_admins_cannot_own_a_business(): void
    {
        $this->actingAsUser($this->user(['is_platform_admin' => true]))
            ->postJson('/api/v1/onboarding/business', $this->payload())
            ->assertForbidden();
    }
}
