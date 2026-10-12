<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\GalleryImage;
use App\Modules\Website\Services\SitePresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Per-business /robots.txt and /sitemap.xml. The web server (or the Vite dev
 * proxy) sends these two paths here with the visitor's host, so each business
 * gets its own files. Unpublished, demo and suspended sites ask not to be indexed.
 */
class SeoController extends Controller
{
    public const PAGES = ['/', '/menu', '/about', '/gallery', '/contact'];

    /** DineDesk's own marketing pages on the platform domain (same list as the frontend's MARKETING_PAGES). */
    public const PLATFORM_PAGES = [
        '/', '/pricing', '/themes', '/features/restaurant-website', '/features/online-ordering',
        '/features/qr-menu-ordering', '/features/pos-billing', '/features/hotel-management',
    ];

    public function __construct(
        private readonly TenantResolver $resolver,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function robots(Request $request): Response
    {
        if ($this->onPlatform($request)) {
            $host = $this->platformHost();
            $private = collect(['/dashboard', '/platform', '/onboarding', '/kitchen', '/waiter', '/login'])->map(fn ($p) => "Disallow: {$p}")->implode("
");

            return $this->text("User-agent: *
Allow: /
{$private}

Sitemap: https://{$host}/sitemap.xml
");
        }
        $tenant = $this->tenant($request);
        if (! $tenant || ! $this->indexable($tenant)) {
            return $this->text("User-agent: *\nDisallow: /\n");
        }
        $host = $this->presenter->primaryHost($tenant);

        return $this->text("User-agent: *\nAllow: /\n\nSitemap: https://{$host}/sitemap.xml\n");
    }

    public function sitemap(Request $request): Response
    {
        if ($this->onPlatform($request)) {
            $host = $this->platformHost();
            $urls = collect(self::PLATFORM_PAGES)->map(fn ($p) => "  <url><loc>https://{$host}{$p}</loc></url>")->implode("
");

            return $this->xml("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">
{$urls}
</urlset>
");
        }
        $tenant = $this->tenant($request);
        abort_if(! $tenant || ! $this->indexable($tenant), 404);

        $host = $this->presenter->primaryHost($tenant);
        $pages = $this->context->run($tenant, function () use ($tenant) {
            $pages = array_values(array_filter(self::PAGES, fn ($p) => $p !== '/gallery' || GalleryImage::exists()));
            // Hotel pages, when the business has them.
            $hotel = $this->presenter->hotel($tenant);
            if ($hotel && $hotel['has_rooms']) {
                $pages[] = '/rooms';
            }
            if ($hotel && $hotel['banquets']) {
                $pages[] = '/events';
            }

            return $pages;
        });
        $lastmod = $tenant->updated_at->toDateString();

        $urls = collect($pages)->map(fn ($p) => sprintf(
            "  <url><loc>https://%s%s</loc><lastmod>%s</lastmod>%s</url>",
            $host,
            $p === '/' ? '/' : $p,
            $lastmod,
            sprintf('<xhtml:link rel="alternate" hreflang="hi" href="https://%s%s?lang=hi"/>', $host, $p === '/' ? '/' : $p),
        ))->implode("\n");

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'."\n"
            .$urls."\n</urlset>\n";

        return response($xml, 200, ['Content-Type' => 'application/xml; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
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
        return response('<?xml version="1.0" encoding="UTF-8"?>'."
".$body, 200, ['Content-Type' => 'application/xml; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
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
