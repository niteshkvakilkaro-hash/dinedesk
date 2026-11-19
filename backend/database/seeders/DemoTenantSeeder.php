<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Onboarding\Support\DemoBusiness;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * DEMO DATA: one sample business per theme (App\Modules\Onboarding\Support\DemoBusiness), the
 * "See live demo sites" on the marketing pages.
 * In development owners sign in with demo-*@example.com / DemoOwner2026. In production each owner
 * gets a random password instead (printed once), so nobody can sign in with the published one.
 */
class DemoTenantSeeder extends Seeder
{
    public function run(): void
    {
        $production = app()->environment('production');

        foreach (DemoBusiness::DEMOS as $demo) {
            if (User::where('email', $demo['email'])->exists()) {
                continue;
            }
            $password = $production ? Str::password(16, symbols: false) : 'DemoOwner2026';
            $owner = User::create([
                'name' => "{$demo['name']} Owner",
                'email' => $demo['email'],
                'password' => $password,
                'email_verified_at' => now(),
            ]);
            $tenant = app(DemoBusiness::class)->create($owner, $demo);
            $this->command?->info("Demo ({$demo['theme']}): http://{$tenant->slug}.".config('dinedesk.platform_domain')."  (owner: {$demo['email']} / {$password})");
        }
    }
}
