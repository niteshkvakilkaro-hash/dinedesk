<?php

namespace App\Modules\Website\Services;

use App\Modules\Menu\Models\MenuCategory;
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

        return [
            'name' => $tenant->name,
            'business_type' => $tenant->business_type,
            'city' => $tenant->city,
            'status' => $tenant->status,
            'is_live' => $tenant->status === 'live',
            'is_demo' => $tenant->is_demo,
            'timezone' => $tenant->timezone,
            'theme' => $this->theme($theme),
            'content' => $content,
            'opening_hours' => $hours,
            'holidays' => OpeningHours::upcomingHolidays($holidays, $tenant->timezone),
            'open_status' => $hours ? OpeningHours::status($hours, $tenant->timezone, null, $holidays) : null,
            'has_menu' => MenuCategory::where('is_active', true)->whereHas('items')->exists(),
            'has_gallery' => GalleryImage::exists(),
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

    public function menu(): array
    {
        return MenuCategory::where('is_active', true)
            ->with(['items' => fn ($q) => $q->select([
                'id', 'menu_category_id', 'name', 'name_hi', 'description', 'description_hi', 'price', 'food_type',
                'spice_level', 'allergens', 'is_available', 'is_bestseller', 'is_chefs_special', 'image', 'is_demo',
            ])])
            ->orderBy('sort_order')->orderBy('id')
            ->get()
            ->filter(fn ($c) => $c->items->isNotEmpty())
            ->map(fn (MenuCategory $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'name_hi' => $c->name_hi,
                'slug' => $c->slug,
                'is_demo' => $c->is_demo,
                'items' => $c->items->map(fn ($i) => [
                    'id' => $i->id,
                    'name' => $i->name,
                    'name_hi' => $i->name_hi,
                    'description' => $i->description,
                    'description_hi' => $i->description_hi,
                    'price' => $i->price,
                    'food_type' => $i->food_type,
                    'spice_level' => $i->spice_level,
                    'allergens' => $i->allergens ?? [],
                    'is_available' => $i->is_available,
                    'is_bestseller' => $i->is_bestseller,
                    'is_chefs_special' => $i->is_chefs_special,
                    'image' => $this->images->present($i->image),
                    'is_demo' => $i->is_demo,
                ])->values(),
            ])
            ->values()
            ->all();
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
