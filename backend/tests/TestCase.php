<?php

namespace Tests;

use App\Models\User;
use App\Modules\Identity\Support\Roles;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Plans\Models\Plan;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Database\Seeders\PlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PlanSeeder::class);
        Roles::sync();
        app(TenantContext::class)->set(null);
    }

    protected function user(array $attrs = []): User
    {
        return User::create($attrs + [
            'name' => 'User '.Str::random(4),
            'email' => Str::lower(Str::random(8)).'@example.test',
            'password' => 'Password123',
        ]);
    }

    /** A business with its owner, created through the real onboarding action. */
    protected function business(string $name = 'Cafe Sol', string $plan = 'growth', array $attrs = []): Tenant
    {
        $owner = $this->user(['name' => "{$name} Owner"]);
        $tenant = app(CreateBusiness::class)($owner, [
            'business_type' => 'cafe',
            'name' => $name,
            'city' => 'Pune',
            'opening_hours' => OpeningHours::default(),
        ]);
        if ($plan !== 'growth' || $attrs) {
            $tenant->update($attrs + ['plan_id' => Plan::where('code', $plan)->value('id')]);
        }
        app(TenantContext::class)->set(null);

        return $tenant->fresh();
    }

    protected function ownerOf(Tenant $tenant): User
    {
        return User::where('tenant_id', $tenant->id)->orderBy('id')->firstOrFail();
    }

    /** Adds a staff member with a role inside the tenant. */
    protected function staff(Tenant $tenant, string $role, array $attrs = []): User
    {
        $user = $this->user($attrs + ['tenant_id' => $tenant->id]);
        app(TenantContext::class)->run($tenant, fn () => $user->assignRole($role));

        return $user;
    }

    protected function actingAsUser(User $user): static
    {
        Sanctum::actingAs($user);
        app(TenantContext::class)->set(null);

        return $this;
    }

    protected function host(Tenant $tenant): string
    {
        return $tenant->slug.'.'.config('dinedesk.platform_domain');
    }
}
