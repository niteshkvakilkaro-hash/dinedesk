<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\Seeder;

/**
 * DEMO DATA: one sample business so the subdomain site and dashboard can be
 * tried immediately. Flagged is_demo and shown with a "Demo" label.
 * Sign in as demo-owner@example.com / DemoOwner2026 (development only).
 */
class DemoTenantSeeder extends Seeder
{
    public function run(): void
    {
        // The demo owner has a published password: never create it in production.
        if (app()->environment('production')) {
            $this->command?->warn('Skipping demo business in production.');

            return;
        }
        if (Tenant::where('is_demo', true)->exists()) {
            return;
        }

        $owner = User::create([
            'name' => 'Demo Owner',
            'email' => 'demo-owner@example.com',
            'password' => 'DemoOwner2026',
            'email_verified_at' => now(),
        ]);

        $tenant = app(CreateBusiness::class)($owner, [
            'business_type' => 'restaurant',
            'name' => 'Haveli Demo',
            'city' => 'Jaipur',
            'gstin' => null,
            'opening_hours' => OpeningHours::default(),
        ]);

        $tenant->update(['is_demo' => true]);

        $this->command?->info("Demo business: http://{$tenant->slug}.".config('dinedesk.platform_domain').':5173  (owner: demo-owner@example.com / DemoOwner2026)');
    }
}
