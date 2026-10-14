<?php

namespace App\Modules\Website\Services;

use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Services\MenuPresenter;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tiffin\Models\MealPlan;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Support\Themes;
use App\Support\Images\ImageService;
use App\Support\Translations;

/**
 * Shapes what a public website needs. Runs inside the tenant's context, so
 * every query here is already limited to that one business.
 */
class SitePresenter
{
    public function __construct(
        private readonly TenantSettings $settings,
        private readonly SiteContent $content,
        private readonly ImageService $images,
        private readonly FeatureService $features,
    ) {}

    public function site(Tenant $tenant): array
    {
        $theme = ThemeSetting::current();
        $hours = $this->settings->get('opening_hours');
        $holidays = (array) $this->settings->get('holidays', []);
        $content = $this->content->forPublic();
        $host = $this->primaryHost($tenant);
        $hasMenu = MenuCategory::where('is_active', true)->whereHas('items')->exists();

        return [
            'name' => $tenant->name,
            'business_type' => $tenant->business_type,
            'city' => $tenant->city,
            'status' => $tenant->status,
            'is_live' => $tenant->status === 'live',
            'is_demo' => $tenant->is_demo,
            // Shown in the footer only when the owner opts in.
            'gstin' => ($content['legal']['show_gstin'] ?? false) ? $tenant->gstin : null,
            'timezone' => $tenant->timezone,
            'theme' => $this->theme($theme),
            'content' => $content,
            'opening_hours' => $hours,
            'holidays' => OpeningHours::upcomingHolidays($holidays, $tenant->timezone),
            'open_status' => $hours ? OpeningHours::status($hours, $tenant->timezone, null, $holidays) : null,
            'has_menu' => $hasMenu,
            'has_gallery' => GalleryImage::exists(),
            // Tiffin / meal plans on offer: the site shows a Tiffin page.
            'has_tiffin' => MealPlan::where('is_active', true)->exists(),
            // The pin the owner set (Ordering → location), for maps and search engines.
            'geo' => $this->geo(),
            'ordering' => $this->ordering($tenant, $hasMenu) + [
                // Cart sent to the business's own WhatsApp, when the owner takes orders that way.
                'whatsapp' => $hasMenu && (app(OrderingSettings::class)->get()['whatsapp_orders'] ?? false) ? ($content['contact']['whatsapp'] ?? null) : null,
            ],
            'features' => [
                'online_ordering' => $this->features->enabled($tenant, 'online_ordering'),
                'reservations' => $this->features->enabled($tenant, 'reservations'),
                'qr_ordering' => $this->features->enabled($tenant, 'qr_ordering'),
                'hotel' => $this->features->enabled($tenant, 'hotel'),
            ],
            'hotel' => $this->hotel($tenant),
            'reservations' => $this->reservations($tenant),
            'growth' => $this->growth($tenant),
            'seo' => [
                'title' => $tenant->city ? "{$tenant->name}, {$tenant->city}" : $tenant->name,
                'description' => $content['seo']['description'] ?? $content['tagline'] ?? $this->factualDescription($tenant),
                'description_hi' => $content['seo']['description_hi'] ?? $content['tagline_hi'],
                'canonical' => "https://{$host}",
                'image' => $this->images->present($theme->cover)['src'] ?? null,
                // Only real, published sites ask to be indexed.
                'indexable' => $tenant->status === 'live' && ! $tenant->is_demo,
            ],
        ];
    }

    public function theme(ThemeSetting $theme): array
    {
        return [
            'key' => $theme->theme,
            'primary_color' => $theme->primary_color,
            'accent_color' => $theme->accent_color,
            'logo' => $this->images->present($theme->logo),
            'cover' => $this->images->present($theme->cover),
            'sections' => Themes::normalizeSections($theme->sections ?? []),
        ];
    }

    /** Active categories with their dishes; each dish carries its variants and add-on groups. */
    public function menu(): array
    {
        $menu = app(MenuPresenter::class)->public();
        $groups = collect($menu['addon_groups'])->keyBy('id');

        return array_map(function (array $c) use ($groups) {
            $c['items'] = collect($c['items'])->map(function (array $i) use ($groups) {
                $i['addon_groups'] = collect($i['addon_group_ids'])->map(fn ($id) => $groups->get($id))->filter()->values();
                unset($i['addon_group_ids'], $i['category_id']);

                return $i;
            })->values();

            return $c;
        }, $menu['categories']);
    }

    /** How this business takes orders right now (what the cart and checkout may offer). */
    /** @return array{lat: float, lng: float}|null */
    private function geo(): ?array
    {
        $l = app(OrderingSettings::class)->get()['location'] ?? [];

        return isset($l['lat'], $l['lng']) && $l['lat'] !== null && $l['lng'] !== null ? ['lat' => (float) $l['lat'], 'lng' => (float) $l['lng']] : null;
    }

    public function ordering(Tenant $tenant, bool $hasMenu): array
    {
        $ordering = app(OrderingSettings::class);
        $s = $ordering->get();
        $types = array_keys(array_filter($s['types']));

        return [
            'enabled' => $hasMenu && $s['accepting_orders'] && $types && $this->features->enabled($tenant, 'online_ordering'),
            'types' => $types,
            'payment_methods' => collect($types)->mapWithKeys(fn ($t) => [$t => $ordering->methodsFor($t, $s)])->all(),
            'scheduling' => $s['scheduling'],
            'prep_minutes' => $s['prep_minutes'],
            'delivery_minutes' => $s['delivery_minutes'],
            'packaging_fee' => number_format((float) $s['packaging_fee'], 2, '.', ''),
            'prices_include_tax' => $s['prices_include_tax'],
            'default_tax_rate' => $s['default_tax_rate'],
            'has_delivery_zones' => DeliveryZone::where('is_active', true)->exists(),
            // Where UPI payments go (the payee name defaults to the business name).
            'upi' => $s['payments']['upi'] && $s['upi']['vpa'] ? ['vpa' => $s['upi']['vpa'], 'payee' => $s['upi']['payee'] ?: $tenant->name] : null,
        ];
    }

    /**
     * Offers, banners, loyalty and real published reviews for the website.
     * Reviews are only guests' own feedback they agreed to show and the owner published.
     */
    public function growth(Tenant $tenant): array
    {
        $marketing = $this->features->enabled($tenant, 'coupons');
        $banners = $marketing ? \App\Modules\Marketing\Models\Banner::where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderBy('sort_order')->orderByDesc('id')->get()
            ->map(fn ($b) => $b->only(['id', 'placement', 'title', 'title_hi', 'text', 'text_hi', 'cta_label', 'cta_link', 'coupon_code']) + ['translations' => Translations::clean($b->translations, ['title', 'text']), 'ends_at' => $b->ends_at?->toIso8601String()])->values()->all() : [];
        $loyalty = app(\App\Modules\Loyalty\Services\Loyalty::class)->get();
        $loyaltyOn = $loyalty['enabled'] && $this->features->enabled($tenant, 'loyalty');

        return [
            'banners' => $banners,
            'has_offers' => $marketing && (count($banners) > 0 || \App\Modules\Marketing\Models\Coupon::where('is_public', true)->where('is_active', true)->where('online', true)->exists()),
            'coupons' => $marketing,
            'loyalty' => $loyaltyOn ? ['enabled' => true, 'earn_per_100' => $loyalty['earn_per_100'], 'point_value' => $loyalty['point_value'], 'min_redeem' => $loyalty['min_redeem'], 'max_redeem_percent' => $loyalty['max_redeem_percent']] : ['enabled' => false],
            'reviews' => app(\App\Modules\Crm\Services\FeedbackService::class)->published(),
        ];
    }

    /** Hotel pages: rooms (once a room type has rooms), room QR ordering, event enquiries. */
    public function hotel(Tenant $tenant): ?array
    {
        if (! $this->features->enabled($tenant, 'hotel')) {
            return null;
        }
        $s = app(HotelSettings::class)->get();

        return [
            'has_rooms' => RoomType::where('is_active', true)->whereHas('rooms', fn ($q) => $q->where('is_active', true))->exists(),
            'online_booking' => $s['online_booking'],
            'room_service' => $s['room_service'],
            'banquets' => $s['banquets'],
            'check_in_time' => $s['check_in_time'],
            'check_out_time' => $s['check_out_time'],
        ];
    }

    /** What the booking form needs (only when online booking is on). */
    public function reservations(Tenant $tenant): array
    {
        $s = app(\App\Modules\Reservations\Services\ReservationSettings::class)->get();
        $enabled = $s['enabled'] && $this->features->enabled($tenant, 'reservations');

        return [
            'enabled' => $enabled,
            'auto_confirm' => $s['auto_confirm'],
            'min_party' => $s['min_party'],
            'max_party' => $s['max_party'],
            'max_days' => $s['max_days'],
            'duration_minutes' => $s['duration_minutes'],
            'blackout_dates' => $enabled ? OpeningHours::upcomingHolidays($s['blackout_dates'], $tenant->timezone, null, 30) : [],
        ];
    }

    public function gallery(): array
    {
        return GalleryImage::orderBy('sort_order')->orderBy('id')->get()
            ->map(fn (GalleryImage $g) => $this->galleryItem($g))
            ->all();
    }

    public function galleryItem(GalleryImage $g): array
    {
        return [
            'id' => $g->id,
            'image' => $this->images->present($g->image),
            'alt_text' => $g->alt_text,
            'caption' => $g->caption,
            'category' => $g->category,
            'sort_order' => $g->sort_order,
            'is_demo' => $g->is_demo,
        ];
    }

    public function primaryHost(Tenant $tenant): string
    {
        $domain = $tenant->domains()->where('is_primary', true)->value('domain');

        return $domain ?: $tenant->slug.'.'.config('dinedesk.platform_domain');
    }

    /** Built only from what the owner entered: name, type, city. */
    private function factualDescription(Tenant $tenant): string
    {
        $type = str_replace('_', ' ', $tenant->business_type);

        return $tenant->city ? "{$tenant->name} — {$type} in {$tenant->city}." : "{$tenant->name} — {$type}.";
    }
}
