<?php

namespace Tests\Feature\Website;

use Tests\TestCase;

/** Each business website installs as its own app. */
class SiteAppTest extends TestCase
{
    public function test_manifest_and_icons_per_business(): void
    {
        $tenant = $this->business('Spice Route', 'growth', ['status' => 'live']);
        $m = $this->get('/site.webmanifest', ['X-Tenant-Host' => $this->host($tenant)])->assertOk()
            ->assertHeader('Content-Type', 'application/manifest+json')->json();
        $this->assertSame('Spice Route', $m['name']);
        $this->assertSame('standalone', $m['display']);
        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/i', $m['theme_color']);
        $this->assertSame('/site-icon-512.png', $m['icons'][1]['src']);

        $png = $this->get('/site-icon-192.png', ['X-Tenant-Host' => $this->host($tenant)])->assertOk()->assertHeader('Content-Type', 'image/png')->getContent();
        [$w, $h] = getimagesizefromstring($png);
        $this->assertSame([192, 192], [$w, $h]);

        $this->get('/site-icon-64.png', ['X-Tenant-Host' => $this->host($tenant)])->assertNotFound();
        $this->get('/site.webmanifest', ['X-Tenant-Host' => 'nobody.'.config('dinedesk.platform_domain')])->assertNotFound();
    }

    public function test_websites_at_s_slug_name_their_business_in_the_path(): void
    {
        $tenant = $this->business('Spice Route', 'growth', ['status' => 'live']);
        $platform = (string) config('dinedesk.platform_domain');

        $m = $this->get("/s/{$tenant->slug}/site.webmanifest", ['X-Tenant-Host' => $platform])->assertOk()->json();
        $this->assertSame('Spice Route', $m['name']);
        $this->assertSame("/s/{$tenant->slug}/?source=app", $m['start_url']);
        $this->assertSame("/s/{$tenant->slug}/", $m['scope']);
        $this->assertSame("/s/{$tenant->slug}/site-icon-512.png", $m['icons'][1]['src']);
        $this->assertSame("/s/{$tenant->slug}/menu", $m['shortcuts'][0]['url']);
        $this->get("/s/{$tenant->slug}/site-icon-192.png", ['X-Tenant-Host' => $platform])->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->get("/site.webmanifest?site={$tenant->slug}", ['X-Tenant-Host' => $platform])->assertOk(); // the query form works too

        // Only on the platform's own host, and only a real slug.
        $this->get('/s/nobody/site.webmanifest', ['X-Tenant-Host' => $platform])->assertNotFound();
        $this->get('/site.webmanifest?site=../x', ['X-Tenant-Host' => $platform])->assertNotFound();
        $other = $this->get("/s/{$tenant->slug}/site.webmanifest", ['X-Tenant-Host' => 'nobody.'.$platform]);
        $other->assertNotFound();
    }
}
