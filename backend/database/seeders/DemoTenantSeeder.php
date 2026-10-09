<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Services\SiteContent;
use Illuminate\Database\Seeder;

/**
 * DEMO DATA: one sample business per theme so every theme can be seen live.
 * All are flagged is_demo, labelled "Demo" on the site, never indexed, and
 * carry no invented contact details, reviews or ratings.
 * Owners sign in with demo-*@example.com / DemoOwner2026 (development only).
 */
class DemoTenantSeeder extends Seeder
{
    private const DEMOS = [
        ['theme' => 'haveli', 'name' => 'Haveli Demo', 'type' => 'restaurant', 'city' => 'Jaipur', 'email' => 'demo-owner@example.com'],
        ['theme' => 'bistro', 'name' => 'Bistro Demo', 'type' => 'cafe', 'city' => 'Bengaluru', 'email' => 'demo-bistro@example.com'],
        ['theme' => 'street', 'name' => 'Street Demo', 'type' => 'cloud_kitchen', 'city' => 'Mumbai', 'email' => 'demo-street@example.com'],
    ];

    public function run(): void
    {
        // The demo owners have a published password: never create them in production.
        if (app()->environment('production')) {
            $this->command?->warn('Skipping demo businesses in production.');

            return;
        }

        foreach (self::DEMOS as $demo) {
            if (User::where('email', $demo['email'])->exists()) {
                continue;
            }
            $tenant = $this->create($demo);
            $this->command?->info("Demo ({$demo['theme']}): http://{$tenant->slug}.".config('dinedesk.platform_domain')."  (owner: {$demo['email']} / DemoOwner2026)");
        }
    }

    private function create(array $demo): Tenant
    {
        $owner = User::create([
            'name' => "{$demo['name']} Owner",
            'email' => $demo['email'],
            'password' => 'DemoOwner2026',
            'email_verified_at' => now(),
        ]);

        $tenant = app(CreateBusiness::class)($owner, [
            'business_type' => $demo['type'],
            'name' => $demo['name'],
            'city' => $demo['city'],
            'gstin' => null,
            'opening_hours' => OpeningHours::default(),
        ]);
        $tenant->update(['is_demo' => true, 'status' => 'live', 'onboarding_step' => 8]);

        app(TenantContext::class)->run($tenant, function () use ($demo, $tenant) {
            ThemeSetting::current()->update(['theme' => $demo['theme']]);

            $theme = ucfirst($demo['theme']);
            $content = SiteContent::empty();
            $content['tagline'] = "A demo website in the {$theme} theme";
            $content['tagline_hi'] = "{$theme} थीम में एक डेमो वेबसाइट";
            $content['about'] = "This is a demo business created to show the {$theme} theme on DineDesk. The menu, prices and text are sample content, not a real restaurant.";
            $content['about_hi'] = "यह DineDesk पर {$theme} थीम दिखाने के लिए बनाया गया डेमो बिज़नेस है। मेनू, दाम और टेक्स्ट नमूना सामग्री हैं, कोई असली रेस्टोरेंट नहीं।";
            $content['milestones'] = [
                ['year' => 'Step 1', 'title' => 'Sign up', 'title_hi' => 'साइन अप', 'text' => 'Create an account with your phone or email.', 'text_hi' => 'फ़ोन या ईमेल से अकाउंट बनाएँ।'],
                ['year' => 'Step 2', 'title' => 'Pick a theme', 'title_hi' => 'थीम चुनें', 'text' => 'Haveli, Bistro or Street, with your colours and logo.', 'text_hi' => 'हवेली, बिस्ट्रो या स्ट्रीट, अपने रंग और लोगो के साथ।'],
                ['year' => 'Step 3', 'title' => 'Go live', 'title_hi' => 'लाइव जाएँ', 'text' => 'Your site is ready on its own address.', 'text_hi' => 'आपकी साइट अपने पते पर तैयार है।'],
            ];
            app(SiteContent::class)->save($content);

            SampleMenu::install(SampleMenu::keyFor($tenant->business_type));
        });

        return $tenant->fresh();
    }
}
