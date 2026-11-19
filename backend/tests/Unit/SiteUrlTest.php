<?php

namespace Tests\Unit;

use App\Support\SiteUrl;
use Tests\TestCase;

/** Business website addresses: subdomains by default, /s/<slug> on hosting without wildcard subdomains. */
class SiteUrlTest extends TestCase
{
    public function test_subdomain_pattern(): void
    {
        config(['dinedesk.site_url_pattern' => 'https://{host}', 'dinedesk.platform_domain' => 'nikobite.in']);

        $this->assertSame('https://haveli.nikobite.in', SiteUrl::for('haveli.nikobite.in'));
        $this->assertSame('https://myrestaurant.in', SiteUrl::for('myrestaurant.in'));
    }

    public function test_path_pattern_keeps_own_domains(): void
    {
        config(['dinedesk.site_url_pattern' => 'https://doxezy.in/s/{slug}/', 'dinedesk.platform_domain' => 'doxezy.in']);

        $this->assertSame('https://doxezy.in/s/haveli', SiteUrl::for('haveli.doxezy.in'));
        $this->assertSame('https://myrestaurant.in', SiteUrl::for('myrestaurant.in'));
    }
}
