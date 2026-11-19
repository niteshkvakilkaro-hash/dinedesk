<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Support\Themes;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

/**
 * Each business website installs as its own app: /site.webmanifest (name, colours, start page,
 * shortcuts) and /site-icon-{192|512}.png made from the owner's logo on their brand colour, or
 * the first letter of the name when there is no logo. Phones build the splash screen from these.
 */
class SiteAppController extends Controller
{
    public function __construct(private readonly TenantResolver $resolver, private readonly TenantContext $context) {}

    public function manifest(Request $request): Response
    {
        $tenant = $this->tenant($request);
        [$theme, $colors] = $this->colors($tenant);
        $name = $tenant->name;
        // A /s/<slug> website: the installed app and its icons live under that path.
        $slug = $this->pathSite($request);
        $base = $slug ? '/s/'.$slug : '';
        $icon = fn (int $size) => "{$base}/site-icon-{$size}.png";
        $manifest = [
            'name' => $name,
            'short_name' => mb_strimwidth($name, 0, 14, '…'),
            'description' => $tenant->city ? "{$name}, {$tenant->city}" : $name,
            'id' => $base.'/',
            'start_url' => $base.'/?source=app',
            'scope' => $base.'/',
            'display' => 'standalone',
            'background_color' => $colors['background'],
            'theme_color' => $colors['primary'],
            'icons' => [
                ['src' => $icon(192), 'sizes' => '192x192', 'type' => 'image/png'],
                ['src' => $icon(512), 'sizes' => '512x512', 'type' => 'image/png'],
                ['src' => $icon(512), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
            ],
            // Long-press the app icon for these.
            'shortcuts' => [
                ['name' => 'Menu', 'url' => $base.'/menu'],
                ['name' => 'My orders', 'url' => $base.'/orders'],
            ],
        ];

        return response(json_encode($manifest, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 200, ['Content-Type' => 'application/manifest+json', 'Cache-Control' => 'public, max-age=3600']);
    }

    public function icon(Request $request): Response
    {
        // Read by name: /site-icon-{size}.png and /s/{site}/site-icon-{size}.png share this action.
        $size = (int) $request->route('size');
        abort_unless(in_array($size, [192, 512], true), 404);
        $tenant = $this->tenant($request);
        [$theme, $colors] = $this->colors($tenant);
        $img = imagecreatetruecolor($size, $size);
        [$r, $g, $b] = sscanf($colors['primary'], '#%02x%02x%02x');
        imagefill($img, 0, 0, imagecolorallocate($img, $r, $g, $b));

        $logo = $theme?->logo;
        $file = $logo ? Storage::disk('public')->path("{$logo['path']}-".(int) $logo['width'].'.webp') : null;
        $src = $file && is_file($file) && function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file) : null;
        if ($src) {
            // The logo on a light disc in the middle (inside the maskable safe zone).
            $disc = (int) round($size * 0.72);
            $o = intdiv($size - $disc, 2);
            imagefilledellipse($img, intdiv($size, 2), intdiv($size, 2), $disc, $disc, imagecolorallocate($img, 255, 255, 255));
            $box = (int) round($disc * 0.7);
            [$w, $h] = [imagesx($src), imagesy($src)];
            $scale = min($box / $w, $box / $h);
            [$dw, $dh] = [(int) ($w * $scale), (int) ($h * $scale)];
            imagecopyresampled($img, $src, $o + intdiv($disc - $dw, 2), $o + intdiv($disc - $dh, 2), 0, 0, $dw, $dh, $w, $h);
            imagedestroy($src);
        } else {
            $font = base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans-Bold.ttf');
            $letter = mb_strtoupper(mb_substr(trim($tenant->name), 0, 1));
            $white = imagecolorallocate($img, 255, 255, 255);
            if (is_file($font) && function_exists('imagettftext')) {
                $pt = $size * 0.42;
                $bbox = imagettfbbox($pt, 0, $font, $letter);
                $x = (int) (($size - ($bbox[2] - $bbox[0])) / 2 - $bbox[0]);
                $y = (int) (($size - ($bbox[1] - $bbox[7])) / 2 - $bbox[7]);
                imagettftext($img, $pt, 0, $x, $y, $white, $font, $letter);
            }
        }
        ob_start();
        imagepng($img);
        imagedestroy($img);

        return response((string) ob_get_clean(), 200, ['Content-Type' => 'image/png', 'Cache-Control' => 'public, max-age=86400']);
    }

    private function tenant(Request $request): Tenant
    {
        $host = $this->resolver->hostFrom($request);
        // Websites at <platform domain>/s/<slug> (hosting without wildcard subdomains) name their business in the path.
        if ($slug = $this->pathSite($request)) {
            $host = $slug.'.'.config('dinedesk.platform_domain');
        }
        $tenant = $this->resolver->resolve($host);
        abort_unless($tenant, 404);

        return $tenant;
    }

    /** The business slug of a /s/<slug> website (from the path, or ?site=), only on the platform domain itself. */
    private function pathSite(Request $request): ?string
    {
        $slug = strtolower((string) ($request->route('site') ?? $request->query('site', '')));
        $onPlatform = in_array($this->resolver->hostFrom($request), [config('dinedesk.platform_domain'), 'www.'.config('dinedesk.platform_domain')], true);

        return $onPlatform && preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/', $slug) ? $slug : null;
    }

    /** @return array{0: ?ThemeSetting, 1: array{primary: string, background: string}} */
    private function colors(Tenant $tenant): array
    {
        $theme = $this->context->run($tenant, fn () => ThemeSetting::first());
        $defaults = Themes::CATALOGUE[$theme?->theme ?? 'haveli'] ?? Themes::CATALOGUE['haveli'];
        $hex = fn (?string $c, string $fallback) => $c && preg_match('/^#[0-9a-f]{6}$/i', $c) ? $c : $fallback;

        return [$theme, ['primary' => $hex($theme?->primary_color, $defaults['primary']), 'background' => $hex(null, $defaults['background'])]];
    }
}
