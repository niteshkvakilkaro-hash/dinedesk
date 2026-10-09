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

    public function __construct(
        private readonly TenantResolver $resolver,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function robots(Request $request): Response
    {
        $tenant = $this->tenant($request);
        if (! $tenant || ! $this->indexable($tenant)) {
            return $this->text("User-agent: *\nDisallow: /\n");
        }
        $host = $this->presenter->primaryHost($tenant);

        return $this->text("User-agent: *\nAllow: /\n\nSitemap: https://{$host}/sitemap.xml\n");
    }

    public function sitemap(Request $request): Response
    {
        $tenant = $this->tenant($request);
        abort_if(! $tenant || ! $this->indexable($tenant), 404);

        $host = $this->presenter->primaryHost($tenant);
        $pages = $this->context->run($tenant, fn () => array_values(array_filter(
            self::PAGES,
            fn ($p) => $p !== '/gallery' || GalleryImage::exists(),
        )));
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

    private function indexable(Tenant $tenant): bool
    {
        return $tenant->status === 'live' && ! $tenant->is_demo;
    }

    private function text(string $body): Response
    {
        return response($body, 200, ['Content-Type' => 'text/plain; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
    }
}
