<?php

namespace Database\Seeders;

use App\Models\User;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Marketing\Models\Banner;
use App\Modules\Plans\Models\Plan;
use App\Modules\Marketing\Models\Coupon;
use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Reservations\Services\ReservationSettings;
use App\Modules\Tables\Models\DiningTable;
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
 * - Plus "Hotel Demo": a hotel with a restaurant on the Pro plan (rooms, booking, front desk).
 * - All seven are flagged is_demo, labelled "Demo" on the site and never indexed.
 * - No invented contact details, reviews or ratings. Prices are illustrative.
 * - Photos are freely licensed pictures from Wikimedia Commons and Flickr (found
 *   through Openverse; database/seeders/demo-photos, credits.json). They are not
 *   photos of these demo businesses, and every one is credited on the site.
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
            'gallery' => ['ambience-haveli-1', 'dal-makhani', 'ambience-haveli-2', 'laal-maas', 'paneer-tikka', 'ambience-haveli-3'],
        ],
        [
            'theme' => 'ember', 'name' => 'Ember Demo', 'type' => 'restaurant', 'menu' => 'grill', 'city' => 'Gurugram', 'email' => 'demo-ember@example.com',
            'hours' => ['12:00', '23:30'], 'location' => [28.4595, 77.0266], 'packaging' => 20,
            'zones' => [['Golf Course Road', ['122002', '122009', '122011'], 40, 299, 999], ['Within 6 km', 6, 60, 399, null]],
            'gallery' => ['ambience-ember-1', 'tandoori-chicken', 'ambience-ember-2', 'seekh-kebab', 'ambience-ember-3'],
        ],
        [
            'theme' => 'bistro', 'name' => 'Bistro Demo', 'type' => 'cafe', 'city' => 'Bengaluru', 'email' => 'demo-bistro@example.com',
            'hours' => ['08:00', '22:00'], 'location' => [12.9352, 77.6245], 'packaging' => 10,
            'zones' => [['Koramangala & around', ['560034', '560095', '560047', '560030'], 40, 249, 999], ['Within 5 km', 5, 60, 349, null]],
            'gallery' => ['ambience-bistro-1', 'cappuccino', 'avocado-toast', 'ambience-bistro-2', 'butter-croissant'],
        ],
        [
            'theme' => 'kulhad', 'name' => 'Kulhad Demo', 'type' => 'cafe', 'menu' => 'chai', 'city' => 'Lucknow', 'email' => 'demo-kulhad@example.com',
            'hours' => ['07:00', '22:00'], 'location' => [26.8467, 80.9462], 'packaging' => 5,
            'zones' => [['Hazratganj & around', ['226001', '226010'], 20, 99, 399], ['Within 4 km', 4, 30, 149, null]],
            'gallery' => ['ambience-kulhad-1', 'kulhad-masala-chai', 'jalebi', 'ambience-kulhad-2', 'samosa'],
        ],
        [
            'theme' => 'qsr', 'name' => 'QSR Demo', 'type' => 'cloud_kitchen', 'menu' => 'qsr', 'city' => 'Pune', 'email' => 'demo-qsr@example.com',
            'hours' => ['11:00', '01:00'], 'location' => [18.5204, 73.8567], 'packaging' => 15,
            'zones' => [['Central Pune', ['411001', '411004', '411038'], 30, 199, 599], ['Within 5 km', 5, 45, 249, null]],
            'gallery' => ['classic-veg-burger', 'margherita', 'ambience-qsr-1', 'french-fries', 'crispy-chicken-burger'],
        ],
        [
            'theme' => 'street', 'name' => 'Street Demo', 'type' => 'cloud_kitchen', 'city' => 'Mumbai', 'email' => 'demo-street@example.com',
            'hours' => ['12:00', '01:00'], 'location' => [19.0596, 72.8295], 'packaging' => 10,
            'zones' => [['Bandra', ['400050', '400051', '400052'], 25, 149, 499], ['Within 4 km', 4, 40, 199, null]],
            'gallery' => ['ambience-street-1', 'pani-puri', 'vada-pav', 'ambience-street-2', 'pav-bhaji'],
        ],
        // Hotel with a restaurant (Pro plan): rooms, booking engine, front desk, room service by QR.
        [
            'theme' => 'haveli', 'name' => 'Hotel Demo', 'type' => 'hotel', 'city' => 'Udaipur', 'email' => 'demo-hotel@example.com', 'plan' => 'pro',
            'hours' => ['07:00', '23:00'], 'location' => [24.5854, 73.7125], 'packaging' => 0,
            'zones' => [],
            'gallery' => ['ambience-haveli-2', 'room-view', 'dal-makhani', 'room-twin', 'ambience-haveli-3'],
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
        if (isset($demo['plan'])) {
            $planId = Plan::where('code', $demo['plan'])->value('id');
            $tenant->update(['plan_id' => $planId]);
            // The trial is on the same plan (Billing shows the subscription's plan).
            \App\Modules\Plans\Models\Subscription::withoutTenancy()->where('tenant_id', $tenant->id)->update(['plan_id' => $planId]);
        }

        app(TenantContext::class)->run($tenant, function () use ($demo, $tenant) {
            $theme = ucfirst($demo['theme']);
            ThemeSetting::current()->update(['theme' => $demo['theme'], 'cover' => $this->photo($tenant, "cover-{$demo['theme']}", 'website/cover')]);

            $content = SiteContent::empty();
            $content['tagline'] = "A demo website in the {$theme} theme";
            $content['tagline_hi'] = "{$theme} थीम में एक डेमो वेबसाइट";
            $content['about'] = "This is a demo business created to show the {$theme} theme on DineDesk. The menu, prices and text are sample content, not a real restaurant. Photos are freely licensed pictures from Wikimedia Commons and Flickr (via Openverse), credited at the bottom of each page; they do not show this business.";
            $content['about_hi'] = "यह DineDesk पर {$theme} थीम दिखाने के लिए बनाया गया डेमो बिज़नेस है। मेनू, दाम और टेक्स्ट नमूना सामग्री हैं, कोई असली रेस्टोरेंट नहीं। फ़ोटो Wikimedia Commons और Flickr (Openverse के ज़रिए) से मुक्त लाइसेंस वाली तस्वीरें हैं, जिनका श्रेय हर पेज के नीचे दिया गया है; ये इस बिज़नेस की नहीं हैं।";
            $content['milestones'] = [
                ['year' => 'Step 1', 'title' => 'Sign up', 'title_hi' => 'साइन अप', 'text' => 'Create an account with your phone or email.', 'text_hi' => 'फ़ोन या ईमेल से अकाउंट बनाएँ।'],
                ['year' => 'Step 2', 'title' => 'Pick a theme', 'title_hi' => 'थीम चुनें', 'text' => 'Six website designs, with your colours and logo.', 'text_hi' => 'छह वेबसाइट डिज़ाइन, अपने रंग और लोगो के साथ।'],
                ['year' => 'Step 3', 'title' => 'Take orders', 'title_hi' => 'ऑर्डर लें', 'text' => 'Delivery, takeaway, table bookings and QR ordering at the table.', 'text_hi' => 'डिलीवरी, टेकअवे, टेबल बुकिंग और टेबल पर QR से ऑर्डर।'],
            ];
            app(SiteContent::class)->save($content);

            SampleMenu::install($demo['menu'] ?? SampleMenu::keyFor($tenant->business_type), fn (string $slug) => $this->photo($tenant, $slug, 'menu'));

            foreach ($demo['gallery'] as $i => $slug) {
                $image = $this->photo($tenant, $slug, 'gallery');
                if ($image) {
                    $label = $this->credits()[$slug]['alt'] ?? Str::of($slug)->replace('-', ' ')->title()->value();
                    $interior = str_starts_with($slug, 'ambience-');
                    GalleryImage::create(['image' => $image, 'alt_text' => $label, 'caption' => $interior ? null : $label, 'category' => $interior ? 'interior' : 'food', 'sort_order' => $i + 1, 'is_demo' => true]);
                }
            }

            // Ordering switched on: delivery (by pincode or distance) and takeaway, pay on delivery / at the counter.
            $ordering = OrderingSettings::defaults();
            $ordering['accepting_orders'] = true;
            $dineIn = $tenant->business_type !== 'cloud_kitchen';
            $ordering['types'] = ['delivery' => (bool) $demo['zones'], 'takeaway' => true, 'dine_in' => $dineIn];
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

            // Sit-down demos: tables with QR codes and online table booking (no invented bookings).
            if ($dineIn) {
                // A simple sample floor (owners drag tables to match their room).
                foreach ([['T1', 2, 60, 70, 'round'], ['T2', 2, 230, 70, 'round'], ['T3', 4, 400, 60, 'square'], ['T4', 4, 580, 60, 'square'], ['T5', 4, 60, 330, 'square'], ['T6', 6, 260, 320, 'long'], ['T7', 6, 520, 320, 'long'], ['T8', 8, 800, 200, 'round']] as $ti => [$label, $seats, $x, $y, $shape]) {
                    DiningTable::create(['label' => $label, 'seats' => $seats, 'pos_x' => $x, 'pos_y' => $y, 'shape' => $shape, 'sort_order' => $ti + 1]);
                }
                app(ReservationSettings::class)->save(array_replace(ReservationSettings::defaults(), ['enabled' => true, 'default_capacity' => 20, 'max_party' => 8]));
            }

            if ($tenant->business_type === 'hotel') {
                $this->hotel($tenant);
            }

            // A sample offer so coupons and banners can be tried; clearly marked as demo.
            Coupon::create(['code' => 'DEMO10', 'description' => 'Demo coupon: 10% off (sample offer, not a real promotion)', 'type' => 'percent', 'value' => 10, 'max_discount' => 100, 'min_order' => 300, 'online' => true, 'pos' => true, 'is_public' => true, 'is_active' => true]);
            Banner::create(['placement' => 'bar', 'title' => 'Demo offer: 10% off with code DEMO10', 'title_hi' => 'डेमो ऑफ़र: कोड DEMO10 से 10% छूट', 'cta_label' => 'See offers', 'cta_link' => '/offers', 'coupon_code' => 'DEMO10', 'is_active' => true, 'sort_order' => 1]);
        });

        return $tenant->fresh();
    }

    /**
     * DEMO hotel: sample room types (prices and text are examples, photos are credited stock
     * pictures, not this hotel), rooms with QR codes, online booking, room service, events.
     * No guests or bookings are invented.
     */
    private function hotel(Tenant $tenant): void
    {
        $note = 'Sample room type for this demo; the photo is a freely licensed picture, not this hotel.';
        $types = [
            ['haveli-room', 'Haveli Room', 'हवेली रूम', 'room-twin', 3200, 3800, 2, 3, 1, 600, '2 single beds or 1 double', 220, ['ac', 'wifi', 'tv', 'geyser', 'kettle', 'room_service']],
            ['jharokha-deluxe', 'Jharokha Deluxe', 'झरोखा डीलक्स', 'room-view', 4800, 5600, 2, 3, 2, 900, '1 king bed', 320, ['ac', 'wifi', 'tv', 'geyser', 'view', 'kettle', 'workdesk', 'breakfast', 'room_service']],
            ['maharaja-suite', 'Maharaja Suite', 'महाराजा सुइट', 'room-suite', 8500, null, 2, 2, 1, 0, '1 king bed and a sitting room', 520, ['ac', 'wifi', 'tv', 'geyser', 'view', 'minibar', 'bathtub', 'breakfast', 'room_service', 'non_smoking']],
        ];
        $numbers = [['101', '102', '103', '104'], ['201', '202', '203'], ['301']];
        foreach ($types as $i => [$slug, $name, $nameHi, $photo, $price, $weekend, $base, $adults, $children, $extra, $bed, $size, $amenities]) {
            $image = $this->photo($tenant, $photo, 'rooms');
            $type = RoomType::create([
                'slug' => $slug, 'name' => $name, 'name_hi' => $nameHi, 'description' => $note,
                'description_hi' => 'इस डेमो के लिए नमूना कमरा; फ़ोटो एक मुक्त-लाइसेंस वाली तस्वीर है, इस होटल की नहीं।',
                'photos' => $image ? [['image' => $image, 'alt' => "{$name} (sample photo)"]] : [],
                'amenities' => $amenities, 'bed' => $bed, 'size_sqft' => $size, 'base_occupancy' => $base, 'max_adults' => $adults, 'max_children' => $children,
                'base_price' => $price, 'weekend_price' => $weekend, 'extra_adult_price' => $extra, 'sort_order' => $i + 1,
            ]);
            foreach ($numbers[$i] as $n) {
                Room::create(['room_type_id' => $type->id, 'number' => $n, 'floor' => substr($n, 0, 1), 'qr_token' => Str::random(32), 'sort_order' => (int) $n]);
            }
        }
        app(HotelSettings::class)->save(array_replace(HotelSettings::defaults(), [
            'online_booking' => true, 'room_service' => true, 'banquets' => true, 'check_in_time' => '12:00', 'check_out_time' => '11:00', 'free_cancel_days' => 2,
            'house_rules' => 'Demo house rules: please carry a photo ID for every adult. Quiet hours 10 PM – 7 AM.',
        ]));
    }

    private function credits(): array
    {
        static $credits = null;

        return $credits ??= json_decode((string) file_get_contents(self::PHOTOS.'/credits.json'), true);
    }

    /** Stores a bundled demo photo for the tenant, with its attribution. */
    private function photo(Tenant $tenant, string $slug, string $folder): ?array
    {
        $credits = $this->credits();
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
