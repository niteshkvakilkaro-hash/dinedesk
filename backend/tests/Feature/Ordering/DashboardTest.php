<?php

namespace Tests\Feature\Ordering;

/** The dashboard home: real numbers for the last 7 days, and only what each role may see. */
class DashboardTest extends OrderingTestCase
{
    public function test_owner_sees_the_week_in_numbers_from_real_orders(): void
    {
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $this->postJson('/api/v1/site/orders', $this->orderPayload(['customer' => ['phone' => '98111 22233', 'name' => 'Ravi']]), $this->site())->assertCreated();

        $data = $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/dashboard')->assertOk()->json('data');
        $this->assertSame(2, $data['stats']['orders']['value']);
        $this->assertSame(['takeaway' => 2], $data['stats']['orders']['by_type']);
        $this->assertSame(2, $data['stats']['customers']['value']);
        $this->assertSame(2, $data['stats']['customers']['new']);
        $this->assertNull($data['stats']['orders']['change']); // nothing the week before
        $this->assertCount(7, $data['series']);
        $today = end($data['series']);
        $this->assertSame($data['stats']['revenue']['restaurant'], $today['restaurant']);
        $this->assertSame('Butter Naan', $data['top_dishes'][0]['name']); // 3 per order against 2 Dal
        $this->assertCount(2, $data['recent_orders']);
        $this->assertSame(2, $data['distribution']['orders']);
        $this->assertArrayNotHasKey('rooms', $data); // not a hotel
    }

    public function test_each_role_only_gets_its_own_blocks(): void
    {
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();

        $kitchen = $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/dashboard')->assertOk()->json('data');
        $this->assertArrayNotHasKey('stats', $kitchen);
        $this->assertArrayNotHasKey('recent_customers', $kitchen);

        $cashier = $this->actingAsUser($this->staff($this->tenant, 'cashier'))->getJson('/api/v1/tenant/dashboard')->assertOk()->json('data');
        $this->assertArrayNotHasKey('stats', $cashier); // money needs reports.view
        $this->assertArrayHasKey('recent_orders', $cashier);

        $this->getJson('/api/v1/tenant/dashboard')->assertOk();
        auth()->forgetGuards();
        $this->getJson('/api/v1/tenant/dashboard')->assertUnauthorized();
    }
}
