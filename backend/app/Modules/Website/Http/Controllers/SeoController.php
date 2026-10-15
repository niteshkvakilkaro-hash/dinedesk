<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Services\SitePresenter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

/**
 * Per-business /robots.txt and /sitemap.xml. The web server (or the Vite dev
 * proxy) sends these two paths here with the visitor's host, so each business
 * gets its own files. Unpublished, demo and suspended sites ask not to be indexed.
 */
class SeoController extends Controller
{
    public const PAGES = ['/', '/menu', '/about', '/gallery', '/contact'];

    /** The website's languages (?lang=…; English is the plain address). Same list as the frontend's LANGUAGE_CODES. */
    public const LANGUAGES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml', 'pa'];

    /**
     * Personal pages and steps on a business website (checkout, order tracking, profile, bookings,
     * table / room QR landings …): never crawled. Same list as the frontend's PRIVATE_PATHS.
     */
    public const PRIVATE_PATHS = [
        '/checkout', '/order/', '/orders', '/account', '/bookings', '/reservation', '/t/', '/table',
        '/stay', '/r/', '/unsubscribe', '/style-guide', '/api/',
    ];

    /** DineDesk's own marketing pages on the platform domain (same list as the frontend's MARKETING_PAGES). */
    public const PLATFORM_PAGES = [
        '/', '/pricing', '/themes', '/features/restaurant-website', '/features/online-ordering',
        '/features/qr-menu-ordering', '/features/pos-billing', '/features/hotel-management',
    ];

    /** The DineDesk app itself on the platform domain: sign-in, dashboards, staff apps. */
    public const PLATFORM_PRIVATE = ['/app', '/signup', '/login', '/onboarding', '/dashboard', '/platform', '/kitchen', '/waiter', '/rider', '/api/'];

    public function __construct(
        private readonly TenantResolver $resolver,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function robots(Request $request): Response
    {
        $requestHost = $this->resolver->hostFrom($request);
        if ($this->onPlatform($request)) {
            $host = $this->platformHost();
            // app.{domain} is the app (the marketing pages live on the bare domain): nothing to index there.
            if ($requestHost === "app.{$host}") {
                return $this->text("User-agent: *\nDisallow: /\n");
            }
            $private = collect(self::PLATFORM_PRIVATE)->map(fn ($p) => "Disallow: {$p}")->implode("\n");

            return $this->text("User-agent: *\nAllow: /\n{$private}\n\nSitemap: https://{$host}/sitemap.xml\n");
        }
        $tenant = $this->tenant($request);
        if (! $tenant || ! $this->indexable($tenant)) {
            return $this->text("User-agent: *\nDisallow: /\n");
        }
        $host = $this->presenter->primaryHost($tenant);
        $private = collect(self::PRIVATE_PATHS)->map(fn ($p) => "Disallow: {$p}")->implode("\n");

        // On the business's other address (its subdomain once a custom domain is primary) the pages
        // name the primary address as canonical; the sitemap there is the primary one.
        return $this->text("User-agent: *\nAllow: /\n{$private}\n\nSitemap: https://{$host}/sitemap.xml\n");
    }

    public function sitemap(Request $request): Response|RedirectResponse
    {
        if ($this->onPlatform($request)) {
            $host = $this->platformHost();
            $urls = collect(self::PLATFORM_PAGES)->map(fn ($p) => "  <url><loc>https://{$host}{$p}</loc></url>")->implode("\n");

            return $this->xml("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{$urls}\n</urlset>\n");
        }
        $tenant = $this->tenant($request);
        abort_if(! $tenant || ! $this->indexable($tenant), 404);

        $host = $this->presenter->primaryHost($tenant);
        // A sitemap lists only its own host's addresses: the other address sends crawlers to the primary one.
        if ($this->resolver->hostFrom($request) !== $host) {
            return redirect()->away("https://{$host}/sitemap.xml", 301);
        }

        [$pages, $lastmod] = $this->context->run($tenant, function () use ($tenant) {
            $site = $this->presenter->site($tenant);
            $pages = array_values(array_filter(self::PAGES, fn ($p) => $p !== '/gallery' || $site['has_gallery']));
            // The extra pages, when the business has them (the same rules as the website's own 404s).
            $extra = [
                '/rooms' => $site['hotel']['has_rooms'] ?? false,
                '/events' => $site['hotel']['banquets'] ?? false,
                '/reserve' => $site['reservations']['enabled'],
                '/offers' => $site['growth']['has_offers'],
                '/tiffin' => $site['has_tiffin'],
            ];
            foreach ($extra as $path => $has) {
                if ($has) {
                    $pages[] = $path;
                }
            }
            // The last real change: the business, its website look or its menu.
            $lastmod = collect([$tenant->updated_at, ThemeSetting::max('updated_at'), MenuItem::max('updated_at'), GalleryImage::max('updated_at')])
                ->filter()->map(fn ($d) => Carbon::parse($d))->max();

            return [$pages, $lastmod];
        });

        $url = fn (string $p, string $lang) => "https://{$host}{$p}".($lang === 'en' ? '' : "?lang={$lang}");
        $entries = [];
        foreach ($pages as $p) {
            // Every language version is listed, each with the full set of alternates (itself included).
            $alternates = collect(self::LANGUAGES)
                ->map(fn ($l) => sprintf('    <xhtml:link rel="alternate" hreflang="%s-IN" href="%s"/>', $l, e($url($p, $l))))
                ->push(sprintf('    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>', e($url($p, 'en'))))
                ->implode("\n");
            foreach (self::LANGUAGES as $lang) {
                $entries[] = sprintf("  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n%s\n  </url>", e($url($p, $lang)), $lastmod->toDateString(), $alternates);
            }
        }

        return $this->xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'."\n"
            .implode("\n", $entries)."\n</urlset>\n");
    }

    private function tenant(Request $request): ?Tenant
    {
        return $this->resolver->resolve($this->resolver->hostFrom($request));
    }

    private function onPlatform(Request $request): bool
    {
        return $this->resolver->isPlatformHost($this->resolver->hostFrom($request));
    }

    /** The marketing site's address: the bare platform domain. */
    private function platformHost(): string
    {
        return (string) config('dinedesk.platform_domain');
    }

    private function xml(string $body): Response
    {
        return response('<?xml version="1.0" encoding="UTF-8"?>'."\n".$body, 200, ['Content-Type' => 'application/xml; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
    }

    private function indexable(Tenant $tenant): bool
    {
        return $tenant->status === 'live' && ! $tenant->is_demo;
    }

    private function text(string $body): Response
    {
        return response($body, 200, ['Content-Type' => 'text/plain; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
    }
}
