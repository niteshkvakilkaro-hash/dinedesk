<?php

namespace Tests\Feature\Website;

use App\Modules\Tenancy\Models\Tenant;
use Tests\TestCase;

/** The DineDesk app's place finder: GET /api/v1/directory on the platform host. */
class DirectoryTest extends TestCase
{
    private function live(string $name, array $attrs = []): Tenant
    {
        $tenant = $this->business($name);
        $tenant->update($attrs + ['status' => 'live']);

        return $tenant->fresh();
    }

    public function test_lists_only_live_listed_businesses_real_first_then_demos(): void
    {
        $this->live('Zest Cafe');
        $this->live('Anand Bhavan', ['city' => 'Jaipur']);
        $this->live('Aaa Demo', ['is_demo' => true]);
        $this->business('Still Onboarding'); // not live
        $this->live('Shut Down', ['status' => 'suspended']);
        $this->live('Read Only', ['status' => 'read_only']);
        $this->live('Deleted Place')->delete();

        $res = $this->getJson('/api/v1/directory')->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.per_page', 20);

        $this->assertSame(['Anand Bhavan', 'Zest Cafe', 'Aaa Demo'], array_column($res->json('data'), 'name'));
        $this->assertSame([false, false, true], array_column($res->json('data'), 'is_demo'));

        $row = $res->json('data.0');
        $this->assertSame(['name', 'slug', 'host', 'url', 'business_type', 'city', 'logo', 'cover', 'is_open', 'is_demo'], array_keys($row));
        $this->assertSame('anand-bhavan.'.config('dinedesk.platform_domain'), $row['host']);
        $this->assertSame(str_replace('{host}', $row['host'], config('dinedesk.site_url_pattern')), $row['url']);
        $this->assertSame('cafe', $row['business_type']);
        $this->assertIsBool($row['is_open']);

        // Nothing private: no owner, contact, GSTIN or internal ids anywhere in the payload.
        $json = $res->getContent();
        foreach (['Owner', 'email', 'phone', 'gstin', 'public_id', '"id"', 'plan', 'tenant_id'] as $private) {
            $this->assertStringNotContainsString($private, $json);
        }
    }

    public function test_search_by_name_or_city_case_insensitive(): void
    {
        $this->live('Hungry Haveli', ['city' => 'Jaipur']);
        $this->live('Cafe Sol', ['city' => 'Pune']);
        $this->live('Pune Pav House', ['city' => 'Mumbai']);

        $names = fn (string $query) => array_column($this->getJson('/api/v1/directory?'.$query)->assertOk()->json('data'), 'name');

        $this->assertSame(['Hungry Haveli'], $names('q=haVELi'));
        $this->assertSame(['Hungry Haveli'], $names('q=jaipur'));
        $this->assertSame(['Cafe Sol', 'Pune Pav House'], $names('q=pune'));
        $this->assertSame(['Cafe Sol'], $names('city=PUNE'));
        $this->assertSame([], $names('q=100%25'));
        $this->getJson('/api/v1/directory?q='.str_repeat('a', 81))->assertUnprocessable();
    }

    public function test_owner_can_hide_the_business_from_the_directory(): void
    {
        $tenant = $this->live('Hidden Gem');
        $this->live('Visible Place');
        $owner = $this->ownerOf($tenant);

        $this->actingAsUser($owner)->getJson('/api/v1/tenant/website')->assertOk()->assertJsonPath('data.directory_listed', true);
        $this->putJson('/api/v1/tenant/website/directory', ['listed' => false])->assertOk()->assertJsonPath('data.listed', false);
        $this->getJson('/api/v1/tenant/website')->assertJsonPath('data.directory_listed', false);

        $this->app['auth']->forgetGuards();
        $this->assertSame(['Visible Place'], array_column($this->getJson('/api/v1/directory')->json('data'), 'name'));

        $this->actingAsUser($owner)->putJson('/api/v1/tenant/website/directory', ['listed' => true])->assertOk();
        $this->assertCount(2, $this->getJson('/api/v1/directory')->json('data'));

        // Staff without website rights cannot change it.
        $waiter = $this->staff($tenant, 'waiter');
        $this->actingAsUser($waiter)->putJson('/api/v1/tenant/website/directory', ['listed' => false])->assertForbidden();
    }

    public function test_only_on_the_platform_host_and_rate_limited(): void
    {
        $tenant = $this->live('Cafe Sol');
        $this->getJson('/api/v1/directory', ['X-Tenant-Host' => $this->host($tenant)])->assertNotFound();

        // 60 a minute per visitor (the request above counted too).
        for ($i = 1; $i < 60; $i++) {
            $this->getJson('/api/v1/directory')->assertOk();
        }
        $this->getJson('/api/v1/directory')->assertStatus(429);
    }

    public function test_paginates_twenty_per_page(): void
    {
        for ($i = 1; $i <= 21; $i++) {
            $this->live(sprintf('Place %02d', $i));
        }
        $this->getJson('/api/v1/directory')->assertJsonPath('meta.last_page', 2)->assertJsonCount(20, 'data');
        $this->getJson('/api/v1/directory?page=2')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Place 21');
    }

    /** A scanned QR on a business's own domain: the app checks the host before opening it. */
    public function test_place_lookup_by_host(): void
    {
        $tenant = $this->live('Hungry Haveli');
        $tenant->domains()->create(['domain' => 'hungryhaveli.in', 'type' => 'custom', 'verified_at' => now()]);
        $tenant->domains()->create(['domain' => 'unverified.in', 'type' => 'custom']);
        $this->live('Shut Down', ['status' => 'suspended'])->domains()->create(['domain' => 'shut.in', 'type' => 'custom', 'verified_at' => now()]);

        $this->getJson('/api/v1/directory/place?host=HungryHaveli.in')->assertOk()->assertJsonPath('data.name', 'Hungry Haveli');
        $this->getJson('/api/v1/directory/place?host='.$this->host($tenant))->assertOk()->assertJsonPath('data.host', $this->host($tenant));

        // Hidden from the directory, its own QR codes still open.
        $this->actingAsUser($this->ownerOf($tenant))->putJson('/api/v1/tenant/website/directory', ['listed' => false])->assertOk();
        $this->getJson('/api/v1/directory/place?host=hungryhaveli.in')->assertOk();

        foreach (['unverified.in', 'shut.in', 'example.com', config('dinedesk.platform_domain')] as $host) {
            $this->getJson('/api/v1/directory/place?host='.$host)->assertNotFound()->assertJsonPath('meta.code', 'not_a_place');
        }
        $this->getJson('/api/v1/directory/place')->assertUnprocessable();
    }
}
