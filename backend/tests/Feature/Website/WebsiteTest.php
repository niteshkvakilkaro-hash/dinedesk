<?php

namespace Tests\Feature\Website;

use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Models\GalleryImage;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class WebsiteTest extends TestCase
{
    private function content(array $overrides = []): array
    {
        return array_replace_recursive([
            'tagline' => 'Wood-fired since 1998',
            'about' => 'Family run.',
            'milestones' => [['year' => '1998', 'title' => 'Opened']],
            'contact' => ['phone' => '0141 222 3333', 'whatsapp' => '98290 12345', 'whatsapp_verified' => false, 'email' => 'hi@example.com', 'address' => 'MI Road', 'map_url' => null],
            'socials' => ['instagram' => 'https://instagram.com/x', 'facebook' => null, 'youtube' => null, 'google_maps' => null],
            'seo' => ['description' => null, 'description_hi' => null],
        ], $overrides);
    }

    public function test_theme_is_validated_and_contrast_warnings_returned(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));

        $this->putJson('/api/v1/tenant/website/theme', ['theme' => 'neon'])->assertStatus(422)->assertJsonValidationErrors('theme');
        $this->putJson('/api/v1/tenant/website/theme', ['primary_color' => 'red'])->assertStatus(422)->assertJsonValidationErrors('primary_color');
        $this->putJson('/api/v1/tenant/website/theme', ['sections' => [['key' => 'hacker', 'visible' => true]]])->assertStatus(422);

        // Mid grey: neither white nor dark button text reaches 4.5:1 → warning, but still saved (owner decides).
        $this->putJson('/api/v1/tenant/website/theme', ['theme' => 'bistro', 'primary_color' => '#7a7a7a'])
            ->assertOk()
            ->assertJsonPath('data.theme.key', 'bistro')
            ->assertJsonPath('data.theme.primary_color', '#7A7A7A')
            ->assertJsonPath('meta.warnings.0.field', 'primary_color');

        $this->putJson('/api/v1/tenant/website/theme', ['primary_color' => '#641E16', 'sections' => [['key' => 'gallery', 'visible' => false]]])
            ->assertOk()
            ->assertJsonCount(0, 'meta.warnings')
            ->assertJsonPath('data.theme.sections.0', ['key' => 'gallery', 'visible' => false])
            ->assertJsonCount(6, 'data.theme.sections');

        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($tenant)])->assertJsonPath('data.theme.key', 'bistro');
    }

    public function test_coastal_theme_and_its_south_indian_sample_menu(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));

        // Turmeric is a fill under dark text, so a light owner accent is fine and a dark one warns.
        $this->putJson('/api/v1/tenant/website/theme', ['theme' => 'coastal', 'accent_color' => '#F2C94C'])
            ->assertOk()->assertJsonPath('data.theme.key', 'coastal')->assertJsonCount(0, 'meta.warnings');
        $this->putJson('/api/v1/tenant/website/theme', ['accent_color' => '#1B3A2B'])
            ->assertOk()->assertJsonPath('meta.warnings.0.field', 'accent_color');

        app(TenantContext::class)->run($tenant, fn () => SampleMenu::install('south'));
        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($tenant)])
            ->assertOk()->assertJsonCount(4, 'data')
            ->assertJsonPath('data.0.items.0.name', 'Masala Dosa')
            ->assertJsonPath('data.0.items.0.is_demo', true);
    }

    public function test_only_theme_managers_can_edit_the_website(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->staff($tenant, 'waiter'))->getJson('/api/v1/tenant/website')->assertForbidden();
        $this->actingAsUser($this->staff($tenant, 'manager'))->getJson('/api/v1/tenant/website')->assertOk();
    }

    public function test_content_is_saved_and_whatsapp_shown_only_when_confirmed(): void
    {
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));

        $this->putJson('/api/v1/tenant/website/content', $this->content(['contact' => ['whatsapp' => '12345']]))
            ->assertStatus(422)->assertJsonValidationErrors('contact.whatsapp');
        $this->putJson('/api/v1/tenant/website/content', $this->content(['socials' => ['facebook' => 'javascript:alert(1)']]))
            ->assertStatus(422)->assertJsonValidationErrors('socials.facebook');

        $this->putJson('/api/v1/tenant/website/content', $this->content(['about' => '<script>x</script>Family run.']))
            ->assertOk()
            ->assertJsonPath('data.content.contact.whatsapp', '+919829012345')
            ->assertJsonPath('data.content.about', 'xFamily run.');

        $host = ['X-Tenant-Host' => $this->host($tenant)];
        $this->getJson('/api/v1/site', $host)
            ->assertJsonPath('data.content.tagline', 'Wood-fired since 1998')
            ->assertJsonPath('data.content.contact.whatsapp', null)
            ->assertJsonMissingPath('data.content.contact.whatsapp_verified');

        $this->putJson('/api/v1/tenant/website/content', $this->content(['contact' => ['whatsapp_verified' => true]]))->assertOk();
        $this->getJson('/api/v1/site', $host)->assertJsonPath('data.content.contact.whatsapp', '+919829012345');
    }

    public function test_site_menu_and_gallery_are_isolated_per_business(): void
    {
        $a = $this->business('Cafe Sol');
        $b = $this->business('Spice Route');
        app(TenantContext::class)->run($a, fn () => SampleMenu::install('cafe'));
        app(TenantContext::class)->run($a, fn () => GalleryImage::create(['image' => ['path' => 'x', 'width' => 480, 'height' => 320], 'alt_text' => 'A photo']));

        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($a)])
            ->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0.items.0.is_demo', true);
        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($b)])->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/site/gallery', ['X-Tenant-Host' => $this->host($b)])->assertOk()->assertJsonCount(0, 'data');

        // Another business's photo can't be edited or deleted.
        $photo = GalleryImage::withoutTenancy()->firstOrFail();
        $this->actingAsUser($this->ownerOf($b));
        $this->putJson("/api/v1/tenant/gallery/{$photo->id}", ['alt_text' => 'Mine now'])->assertNotFound();
        $this->deleteJson("/api/v1/tenant/gallery/{$photo->id}")->assertNotFound();
        $this->putJson('/api/v1/tenant/gallery/order', ['ids' => [$photo->id]])->assertStatus(422);
        $this->assertDatabaseHas('gallery_images', ['id' => $photo->id, 'alt_text' => 'A photo']);
    }

    public function test_uploads_are_validated_and_converted_to_webp(): void
    {
        Storage::fake('public');
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));

        $this->postJson('/api/v1/tenant/gallery', ['image' => UploadedFile::fake()->create('menu.pdf', 100, 'application/pdf'), 'alt_text' => 'Menu'])
            ->assertStatus(422)->assertJsonValidationErrors('image');
        $this->postJson('/api/v1/tenant/gallery', ['image' => UploadedFile::fake()->image('tiny.jpg', 50, 50), 'alt_text' => 'Tiny'])
            ->assertStatus(422)->assertJsonValidationErrors('image');
        $this->postJson('/api/v1/tenant/gallery', ['image' => UploadedFile::fake()->image('dish.jpg', 1200, 800)])
            ->assertStatus(422)->assertJsonValidationErrors('alt_text');

        $res = $this->postJson('/api/v1/tenant/gallery', ['image' => UploadedFile::fake()->image('dish.jpg', 1200, 800), 'alt_text' => 'Paneer tikka', 'category' => 'food'])
            ->assertCreated()
            ->assertJsonPath('data.image.width', 1200)
            ->assertJsonPath('data.alt_text', 'Paneer tikka');
        $this->assertStringContainsString("tenants/{$tenant->public_id}/gallery/", $res->json('data.image.src'));
        $this->assertStringStartsWith('data:image/webp;base64,', $res->json('data.image.placeholder'));
        $this->assertCount(3, Storage::disk('public')->allFiles("tenants/{$tenant->public_id}/gallery")); // 480, 960, 1200

        $this->postJson('/api/v1/tenant/website/images/logo', ['image' => UploadedFile::fake()->image('logo.png', 400, 400)])
            ->assertOk()->assertJsonPath('data.theme.logo.width', 400);
        $this->postJson('/api/v1/tenant/website/images/banner', ['image' => UploadedFile::fake()->image('x.png', 400, 400)])->assertNotFound();
        $this->deleteJson('/api/v1/tenant/website/images/logo')->assertOk()->assertJsonPath('data.theme.logo', null);
        $this->assertCount(0, Storage::disk('public')->allFiles("tenants/{$tenant->public_id}/website/logo"));
    }

    public function test_holidays_close_the_business_for_the_day(): void
    {
        $hours = OpeningHours::default();
        $now = CarbonImmutable::parse('2026-11-08 14:00', 'Asia/Kolkata');

        $this->assertTrue(OpeningHours::status($hours, 'Asia/Kolkata', $now)['is_open']);
        $status = OpeningHours::status($hours, 'Asia/Kolkata', $now, [['date' => '2026-11-08', 'label' => 'Diwali']]);
        $this->assertFalse($status['is_open']);
        $this->assertSame('Diwali', $status['holiday']['label']);

        // Late service from a holiday eve doesn't carry over past midnight.
        $late = array_fill_keys(OpeningHours::DAYS, ['closed' => false, 'open' => '18:00', 'close' => '02:00']);
        $afterMidnight = CarbonImmutable::parse('2026-11-09 01:00', 'Asia/Kolkata');
        $this->assertTrue(OpeningHours::status($late, 'Asia/Kolkata', $afterMidnight)['is_open']);
        $this->assertFalse(OpeningHours::status($late, 'Asia/Kolkata', $afterMidnight, [['date' => '2026-11-08', 'label' => null]])['is_open']);

        // Saved through the business endpoint, upcoming ones shown on the site.
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));
        $future = now('Asia/Kolkata')->addDays(3)->format('Y-m-d');
        $this->putJson('/api/v1/tenant/business', ['holidays' => [['date' => 'not-a-date']]])->assertStatus(422);
        $this->putJson('/api/v1/tenant/business', ['holidays' => [
            ['date' => $future, 'label' => 'Festival'],
            ['date' => '2020-01-01', 'label' => 'Old'],
        ]])->assertOk()->assertJsonPath('data.holidays.0.date', '2020-01-01');
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($tenant)])
            ->assertJsonCount(1, 'data.holidays')->assertJsonPath('data.holidays.0.label', 'Festival');
    }

    public function test_the_platform_domain_has_its_own_robots_and_sitemap(): void
    {
        $domain = config('dinedesk.platform_domain');
        $robots = $this->get('/robots.txt', ['X-Tenant-Host' => $domain])->assertOk()
            ->assertSee("Allow: /\n", false)->assertSee("Sitemap: https://{$domain}/sitemap.xml")->getContent();
        foreach (['/dashboard', '/app', '/signup', '/login', '/rider', '/waiter', '/kitchen', '/platform', '/onboarding'] as $private) {
            $this->assertStringContainsString("Disallow: {$private}\n", $robots);
        }
        // app.{domain} is the app itself: nothing there is for search engines.
        $this->get('/robots.txt', ['X-Tenant-Host' => "app.{$domain}"])->assertOk()->assertSee("Disallow: /\n", false)->assertDontSee('Allow:')->assertDontSee('Sitemap:');

        $xml = $this->get('/sitemap.xml', ['X-Tenant-Host' => "www.{$domain}"])->assertOk()->getContent();
        $this->assertNotFalse(simplexml_load_string($xml));
        $this->assertStringContainsString("<loc>https://{$domain}/pricing</loc>", $xml);
        $this->assertStringContainsString("<loc>https://{$domain}/features/qr-menu-ordering</loc>", $xml);
        $this->assertStringNotContainsString('/dashboard', $xml);
        $this->assertStringNotContainsString('/login', $xml);
    }

    public function test_robots_and_sitemap_per_business(): void
    {
        $live = $this->business('Cafe Sol', 'growth', ['status' => 'live']);
        $draft = $this->business('Spice Route');
        $demo = $this->business('Demo Cafe', 'growth', ['status' => 'live', 'is_demo' => true]);
        $suspended = $this->business('Old Cafe', 'growth', ['status' => 'suspended']);
        $host = $this->host($live);

        $robots = $this->get('/robots.txt', ['X-Tenant-Host' => $host])
            ->assertOk()->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
            ->assertSee("Allow: /\n", false)->assertSee("Sitemap: https://{$host}/sitemap.xml")->getContent();
        // Personal pages and QR landings are never crawled; the public pages are.
        foreach (['/checkout', '/order/', '/orders', '/account', '/bookings', '/t/', '/r/', '/table', '/stay', '/api/'] as $private) {
            $this->assertStringContainsString("Disallow: {$private}\n", $robots);
        }
        $this->assertStringNotContainsString('Disallow: /menu', $robots);
        $this->assertStringNotContainsString("Disallow: /\n", $robots);
        foreach ([$this->host($draft), $this->host($demo), $this->host($suspended), 'nobody.dinedesk.test'] as $closed) {
            $this->get('/robots.txt', ['X-Tenant-Host' => $closed])->assertSee("Disallow: /\n", false)->assertDontSee('Allow:')->assertDontSee('Sitemap:');
        }

        $xml = $this->get('/sitemap.xml', ['X-Tenant-Host' => $host])
            ->assertOk()->assertHeader('Content-Type', 'application/xml; charset=UTF-8')->getContent();
        $doc = simplexml_load_string($xml);
        $this->assertNotFalse($doc, 'valid XML');
        $this->assertStringContainsString("<loc>https://{$host}/menu</loc>", $xml);
        $this->assertStringContainsString("<loc>https://{$host}/</loc>", $xml);
        // Every language version is listed, each with all 12 languages + x-default as alternates.
        $this->assertStringContainsString("<loc>https://{$host}/menu?lang=ta</loc>", $xml);
        $this->assertStringContainsString("<xhtml:link rel=\"alternate\" hreflang=\"ta-IN\" href=\"https://{$host}/menu?lang=ta\"/>", $xml);
        $this->assertStringContainsString("<xhtml:link rel=\"alternate\" hreflang=\"x-default\" href=\"https://{$host}/menu\"/>", $xml);
        $doc->registerXPathNamespace('s', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        $menu = $doc->xpath("//s:url[s:loc='https://{$host}/menu?lang=hi']")[0];
        $menu->registerXPathNamespace('x', 'http://www.w3.org/1999/xhtml');
        $menu->registerXPathNamespace('s', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        $this->assertCount(13, $menu->xpath('x:link'));
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', (string) $menu->xpath('s:lastmod')[0]);
        $this->assertStringNotContainsString('/gallery', $xml); // no photos yet
        $this->assertStringNotContainsString('/rooms', $xml); // not a hotel
        $this->assertStringNotContainsString('/reserve', $xml); // table booking is off
        $this->assertStringNotContainsString('/checkout', $xml);
        $this->assertStringNotContainsString('spice-route', $xml);
        $this->get('/sitemap.xml', ['X-Tenant-Host' => $this->host($draft)])->assertNotFound();
        $this->get('/sitemap.xml', ['X-Tenant-Host' => $this->host($demo)])->assertNotFound();

        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $host])->assertJsonPath('data.seo.indexable', true)->assertJsonPath('data.seo.canonical', "https://{$host}");
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($demo)])->assertJsonPath('data.seo.indexable', false);
    }

    public function test_a_primary_custom_domain_is_the_one_address_search_engines_get(): void
    {
        $live = $this->business('Cafe Sol', 'growth', ['status' => 'live']);
        $sub = $this->host($live);
        TenantDomain::where('tenant_id', $live->id)->update(['is_primary' => false]);
        TenantDomain::create(['tenant_id' => $live->id, 'domain' => 'cafesol.in', 'type' => 'custom', 'is_primary' => true, 'verified_at' => now()]);

        // Both addresses name the custom domain as canonical (no duplicate content).
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $sub])->assertJsonPath('data.seo.canonical', 'https://cafesol.in');
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => 'cafesol.in'])->assertJsonPath('data.seo.canonical', 'https://cafesol.in');
        $this->get('/robots.txt', ['X-Tenant-Host' => $sub])->assertSee('Sitemap: https://cafesol.in/sitemap.xml');
        $this->get('/sitemap.xml', ['X-Tenant-Host' => $sub])->assertStatus(301)->assertRedirect('https://cafesol.in/sitemap.xml');
        $xml = $this->get('/sitemap.xml', ['X-Tenant-Host' => 'cafesol.in'])->assertOk()->getContent();
        $this->assertStringContainsString('<loc>https://cafesol.in/menu</loc>', $xml);
        $this->assertStringNotContainsString($sub, $xml);
    }

    public function test_suspended_sites_are_hidden(): void
    {
        $tenant = $this->business('Cafe Sol', 'growth', ['status' => 'suspended']);
        $this->assertSame('suspended', Tenant::find($tenant->id)->status);
        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($tenant)])->assertNotFound();
    }
}
