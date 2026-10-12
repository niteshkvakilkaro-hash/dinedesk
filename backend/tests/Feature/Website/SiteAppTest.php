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
}
