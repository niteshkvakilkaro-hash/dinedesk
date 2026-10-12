<?php

namespace Tests\Feature\Website;

use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
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
        $this->get('/robots.txt', ['X-Tenant-Host' => $domain])->assertOk()
            ->assertSee("Allow: /\nDisallow: /dashboard", false)->assertSee("Sitemap: https://{$domain}/sitemap.xml");
        $xml = $this->get('/sitemap.xml', ['X-Tenant-Host' => "www.{$domain}"])->assertOk()->getContent();
        $this->assertStringContainsString("<loc>https://{$domain}/pricing</loc>", $xml);
        $this->assertStringContainsString("<loc>https://{$domain}/features/qr-menu-ordering</loc>", $xml);
        $this->assertStringNotContainsString('/dashboard', $xml);
    }

    public function test_robots_and_sitemap_per_business(): void
    {
        $live = $this->business('Cafe Sol', 'growth', ['status' => 'live']);
        $draft = $this->business('Spice Route');
        $demo = $this->business('Demo Cafe', 'growth', ['status' => 'live', 'is_demo' => true]);

        $this->get('/robots.txt', ['X-Tenant-Host' => $this->host($live)])
            ->assertOk()->assertSee('Allow: /')->assertSee("Sitemap: https://{$this->host($live)}/sitemap.xml");
        $this->get('/robots.txt', ['X-Tenant-Host' => $this->host($draft)])->assertSee('Disallow: /');
        $this->get('/robots.txt', ['X-Tenant-Host' => $this->host($demo)])->assertSee('Disallow: /');
        $this->get('/robots.txt', ['X-Tenant-Host' => 'nobody.dinedesk.test'])->assertSee('Disallow: /');

        $xml = $this->get('/sitemap.xml', ['X-Tenant-Host' => $this->host($live)])
            ->assertOk()->assertHeader('Content-Type', 'application/xml; charset=UTF-8')->getContent();
        $this->assertStringContainsString("<loc>https://{$this->host($live)}/menu</loc>", $xml);
        $this->assertStringNotContainsString('/gallery<', $xml); // no photos yet
        $this->assertStringNotContainsString('spice-route', $xml);
        $this->get('/sitemap.xml', ['X-Tenant-Host' => $this->host($draft)])->assertNotFound();

        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($live)])->assertJsonPath('data.seo.indexable', true);
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($demo)])->assertJsonPath('data.seo.indexable', false);
    }

    public function test_suspended_sites_are_hidden(): void
    {
        $tenant = $this->business('Cafe Sol', 'growth', ['status' => 'suspended']);
        $this->assertSame('suspended', Tenant::find($tenant->id)->status);
        $this->getJson('/api/v1/site/menu', ['X-Tenant-Host' => $this->host($tenant)])->assertNotFound();
    }
}
