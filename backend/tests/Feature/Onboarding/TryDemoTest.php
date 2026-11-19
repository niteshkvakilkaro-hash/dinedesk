<?php

namespace Tests\Feature\Onboarding;

use App\Models\User;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Tenancy\Models\Tenant;
use Tests\TestCase;

class TryDemoTest extends TestCase
{
    public function test_a_visitor_gets_a_ready_demo_business_and_is_signed_in(): void
    {
        $res = $this->postJson('/api/v1/auth/demo', ['name' => 'Rahul Sharma', 'phone' => '98765 43210', 'business_type' => 'cafe'])
            ->assertCreated()
            ->assertJsonPath('data.session.tenant.is_demo', true)
            ->assertJsonPath('data.session.tenant.status', 'live')
            ->assertJsonPath('data.session.tenant.name', "Rahul's Cafe Demo");

        $tenant = Tenant::where('slug', $res->json('data.session.tenant.slug'))->firstOrFail();
        $this->assertSame('+919876543210', $tenant->demo_lead['phone']);
        $this->assertTrue($tenant->demo_expires_at->between(now()->addDays(6), now()->addDays(8)));
        $this->assertGreaterThan(0, MenuItem::withoutTenancy()->where('tenant_id', $tenant->id)->count());

        // The mobile stays free for a real sign-up; the details shown work for signing in again.
        $this->assertNull(User::where('tenant_id', $tenant->id)->value('phone'));
        $this->postJson('/api/v1/auth/login', ['email' => $res->json('data.demo.email'), 'password' => $res->json('data.demo.password')])->assertOk();
        $this->withToken($res->json('data.token'))->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.user.name', 'Rahul Sharma');
    }

    public function test_the_form_is_checked(): void
    {
        $this->postJson('/api/v1/auth/demo', ['name' => 'R', 'phone' => '12345', 'business_type' => 'spa'])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'phone', 'business_type']);
    }

    public function test_demos_close_when_their_days_are_up(): void
    {
        $res = $this->postJson('/api/v1/auth/demo', ['name' => 'Asha', 'phone' => '9876500000', 'business_type' => 'restaurant'])->assertCreated();
        $tenant = Tenant::where('slug', $res->json('data.session.tenant.slug'))->firstOrFail();

        $this->artisan('demos:expire')->assertSuccessful();
        $this->assertSame('live', $tenant->fresh()->status);

        $this->travel(8)->days();
        $this->artisan('demos:expire')->assertSuccessful();
        $this->assertSame('suspended', $tenant->fresh()->status);
        $this->assertSame(0, User::where('tenant_id', $tenant->id)->firstOrFail()->tokens()->count());
    }
}
