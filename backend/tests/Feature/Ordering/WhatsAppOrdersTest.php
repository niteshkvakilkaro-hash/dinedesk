<?php

namespace Tests\Feature\Ordering;

use App\Modules\Website\Services\SiteContent;

/** WhatsApp orders: the website sends the cart to the business's own WhatsApp when the owner takes orders that way. */
class WhatsAppOrdersTest extends OrderingTestCase
{
    public function test_the_site_offers_whatsapp_orders_only_when_switched_on_with_a_number(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner);
        $settings = $this->getJson('/api/v1/tenant/ordering')->assertOk()->assertJsonPath('data.settings.whatsapp_orders', false)->json('data.settings');
        $this->assertNull($this->getJson('/api/v1/site', $this->site())->json('data.ordering.whatsapp'));

        // Switched on, but no WhatsApp number yet: nothing to send to.
        $this->putJson('/api/v1/tenant/ordering', ['whatsapp_orders' => true, 'accepting_orders' => false] + $settings)->assertOk()
            ->assertJsonPath('data.settings.whatsapp_orders', true)->assertJsonPath('data.whatsapp_number', null);
        $this->assertNull($this->getJson('/api/v1/site', $this->site())->json('data.ordering.whatsapp'));

        $this->asTenant(function () {
            $content = app(SiteContent::class)->get();
            $content['contact']['whatsapp'] = '9876543210';
            // Only a verified number is shown on the website.
            $content['contact']['whatsapp_verified'] = true;
            app(SiteContent::class)->save($content);
        });
        $site = $this->getJson('/api/v1/site', $this->site())->assertOk()->json('data.ordering');
        $this->assertFalse($site['enabled']);
        $this->assertNotNull($site['whatsapp']);
        $this->assertStringContainsString('9876543210', preg_replace('/\D+/', '', $site['whatsapp']));

        // Saving other settings keeps it (the dashboard sends the whole form).
        $this->putJson('/api/v1/tenant/ordering', ['prep_minutes' => 25] + $this->getJson('/api/v1/tenant/ordering')->json('data.settings'))
            ->assertJsonPath('data.settings.whatsapp_orders', true);
    }
}
