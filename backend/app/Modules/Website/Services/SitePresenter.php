<?php

namespace App\Modules\Website\Services;

use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Services\MenuPresenter;
use App\Modules\Ordering\Models\DeliveryZone;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Support\Themes;
use App\Support\Images\ImageService;

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
            'ordering' => $this->ordering($tenant, $hasMenu),
            'features' => [
                'online_ordering' => $this->features->enabled($tenant, 'online_ordering'),
                'reservations' => $this->features->enabled($tenant, 'reservations'),
            ],
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
