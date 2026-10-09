<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Services\SiteContent;
use App\Support\Images\ImageService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * DEMO DATA: one sample business per theme so every theme can be seen live,
 * with a working menu, cart, checkout and order tracking.
 *
 * - All three are flagged is_demo, labelled "Demo" on the site and never indexed.
 * - No invented contact details, reviews or ratings. Prices are illustrative.
 * - Dish photos are freely licensed pictures of those dishes from Wikimedia
 *   Commons (database/seeders/demo-photos, credits.json); they are not photos of
 *   these demo businesses, and every one is credited on the site.
 *
 * Owners sign in with demo-*@example.com / DemoOwner2026 (development only).
 */
class DemoTenantSeeder extends Seeder
{
    private const PHOTOS = __DIR__.'/demo-photos';

    private const DEMOS = [
        [
            'theme' => 'haveli', 'name' => 'Haveli Demo', 'type' => 'restaurant', 'city' => 'Jaipur', 'email' => 'demo-owner@example.com',
            'hours' => ['11:00', '23:00'], 'location' => [26.9124, 75.7873], 'packaging' => 15,
            'zones' => [['Central Jaipur', ['302001', '302003', '302004', '302006', '302016'], 30, 199, 799], ['Within 6 km', 6, 50, 299, null]],
            'gallery' => ['dal-makhani', 'laal-maas', 'paneer-tikka', 'gulab-jamun', 'butter-naan'],
        ],
        [
            'theme' => 'bistro', 'name' => 'Bistro Demo', 'type' => 'cafe', 'city' => 'Bengaluru', 'email' => 'demo-bistro@example.com',
            'hours' => ['08:00', '22:00'], 'location' => [12.9352, 77.6245], 'packaging' => 10,
            'zones' => [['Koramangala & around', ['560034', '560095', '560047', '560030'], 40, 249, 999], ['Within 5 km', 5, 60, 349, null]],
            'gallery' => ['cappuccino', 'avocado-toast', 'butter-croissant', 'granola-bowl', 'banana-bread'],
        ],
        [
            'theme' => 'street', 'name' => 'Street Demo', 'type' => 'cloud_kitchen', 'city' => 'Mumbai', 'email' => 'demo-street@example.com',
            'hours' => ['12:00', '01:00'], 'location' => [19.0596, 72.8295], 'packaging' => 10,
            'zones' => [['Bandra', ['400050', '400051', '400052'], 25, 149, 499], ['Within 4 km', 4, 40, 199, null]],
            'gallery' => ['pani-puri', 'vada-pav', 'pav-bhaji', 'papdi-chaat', 'kala-khatta-gola'],
        ],
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

        [$open, $close] = $demo['hours'];
        $tenant = app(CreateBusiness::class)($owner, [
            'business_type' => $demo['type'],
            'name' => $demo['name'],
            'city' => $demo['city'],
            'gstin' => null,
            'opening_hours' => array_fill_keys(OpeningHours::DAYS, ['closed' => false, 'open' => $open, 'close' => $close]),
        ]);
        $tenant->update(['is_demo' => true, 'status' => 'live', 'onboarding_step' => 8]);

        app(TenantContext::class)->run($tenant, function () use ($demo, $tenant) {
            $theme = ucfirst($demo['theme']);
            ThemeSetting::current()->update(['theme' => $demo['theme'], 'cover' => $this->photo($tenant, "cover-{$demo['theme']}", 'website/cover')]);

            $content = SiteContent::empty();
            $content['tagline'] = "A demo website in the {$theme} theme";
            $content['tagline_hi'] = "{$theme} थीम में एक डेमो वेबसाइट";
            $content['about'] = "This is a demo business created to show the {$theme} theme on DineDesk. The menu, prices and text are sample content, not a real restaurant. Dish photos are freely licensed pictures from Wikimedia Commons, credited at the bottom of each page.";
            $content['about_hi'] = "यह DineDesk पर {$theme} थीम दिखाने के लिए बनाया गया डेमो बिज़नेस है। मेनू, दाम और टेक्स्ट नमूना सामग्री हैं, कोई असली रेस्टोरेंट नहीं। व्यंजनों की फ़ोटो Wikimedia Commons से मुक्त लाइसेंस वाली तस्वीरें हैं, जिनका श्रेय हर पेज के नीचे दिया गया है।";
            $content['milestones'] = [
                ['year' => 'Step 1', 'title' => 'Sign up', 'title_hi' => 'साइन अप', 'text' => 'Create an account with your phone or email.', 'text_hi' => 'फ़ोन या ईमेल से अकाउंट बनाएँ।'],
                ['year' => 'Step 2', 'title' => 'Pick a theme', 'title_hi' => 'थीम चुनें', 'text' => 'Haveli, Bistro or Street, with your colours and logo.', 'text_hi' => 'हवेली, बिस्ट्रो या स्ट्रीट, अपने रंग और लोगो के साथ।'],
                ['year' => 'Step 3', 'title' => 'Take orders', 'title_hi' => 'ऑर्डर लें', 'text' => 'Delivery and takeaway orders with live tracking.', 'text_hi' => 'लाइव ट्रैकिंग के साथ डिलीवरी और टेकअवे ऑर्डर।'],
            ];
            app(SiteContent::class)->save($content);

            SampleMenu::install(SampleMenu::keyFor($tenant->business_type), fn (string $slug) => $this->photo($tenant, $slug, 'menu'));

            foreach ($demo['gallery'] as $i => $slug) {
                $image = $this->photo($tenant, $slug, 'gallery');
                if ($image) {
                    $label = Str::of($slug)->replace('-', ' ')->title()->value();
                    GalleryImage::create(['image' => $image, 'alt_text' => $label, 'caption' => $label, 'category' => 'food', 'sort_order' => $i + 1, 'is_demo' => true]);
                }
            }

            // Ordering switched on: delivery (by pincode or distance) and takeaway, pay on delivery / at the counter.
            $ordering = OrderingSettings::defaults();
            $ordering['accepting_orders'] = true;
            $ordering['types'] = ['delivery' => true, 'takeaway' => true, 'dine_in' => false];
            $ordering['packaging_fee'] = $demo['packaging'];
            $ordering['location'] = ['lat' => $demo['location'][0], 'lng' => $demo['location'][1]];
            app(OrderingSettings::class)->save($ordering);

            foreach ($demo['zones'] as $zi => [$name, $area, $fee, $min, $free]) {
                DeliveryZone::create([
                    'name' => $name,
                    'type' => is_array($area) ? 'pincode' : 'radius',
                    'pincodes' => is_array($area) ? $area : null,
                    'radius_km' => is_array($area) ? null : $area,
                    'fee' => $fee,
                    'min_order' => $min,
                    'free_above' => $free,
                    'is_active' => true,
                    'sort_order' => $zi + 1,
                    'is_demo' => true,
                ]);
            }
        });

        return $tenant->fresh();
    }

    /** Stores a bundled demo photo for the tenant, with its attribution. */
    private function photo(Tenant $tenant, string $slug, string $folder): ?array
    {
        static $credits = null;
        $credits ??= json_decode((string) file_get_contents(self::PHOTOS.'/credits.json'), true);
        $file = self::PHOTOS."/{$slug}.jpg";
        if (! is_file($file) || ! isset($credits[$slug])) {
            return null;
        }
        $c = $credits[$slug];

        return app(ImageService::class)->store($file, $tenant, $folder) + [
            'credit' => ['author' => $c['author'], 'license' => $c['license'], 'license_url' => $c['license_url'], 'source' => $c['source']],
        ];
    }
}
