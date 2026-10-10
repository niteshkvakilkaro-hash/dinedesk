<?php

namespace Tests\Feature\Growth;

use App\Modules\Loyalty\Models\LoyaltyEntry;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Marketing\Models\Coupon;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\Feature\Operations\OperationsTestCase;

/** Coupons and loyalty points, online and at the counter. Naan ₹60 + 5% GST; takeaway packaging ₹10. */
class CouponsAndLoyaltyTest extends OperationsTestCase
{
    private function naanOrder(array $extra = [], int $qty = 2): array
    {
        $payload = $this->orderPayload();
        $payload['items'] = [['item_id' => $this->items['naan']->id, 'quantity' => $qty]];

        return array_replace($payload, $extra);
    }

    private function complete(int $orderId): void
    {
        $owner = $this->ownerOf($this->tenant);
        foreach (['confirmed', 'preparing', 'ready', 'completed'] as $s) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => $s])->assertOk();
        }
        $this->app['auth']->forgetGuards();
    }

    public function test_coupon_is_previewed_applied_before_gst_limited_and_given_back_on_cancel(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/marketing/coupons', ['code' => 'welcome 10', 'type' => 'percent', 'value' => 10, 'max_discount' => 50, 'min_order' => 100, 'usage_limit' => 2, 'per_customer_limit' => 1, 'is_public' => true])
            ->assertCreated()->assertJsonPath('data.code', 'WELCOME10');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/marketing/coupons', ['code' => 'WELCOME10', 'type' => 'flat', 'value' => 5])->assertStatus(422);
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/v1/site/offers', $this->site())->assertJsonPath('data.0.code', 'WELCOME10');

        // Preview: 2 × ₹60 = ₹120 → 10% = ₹12 off → taxable ₹108, GST ₹5.40, + ₹10 packaging = ₹123.40.
        $quote = $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'coupon_code' => 'welcome10', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 2]]], $this->site())
            ->assertOk()->assertJsonPath('data.discount_total', '12.00')->assertJsonPath('data.subtotal', '108.00')->assertJsonPath('data.tax_total', '5.40')
            ->assertJsonPath('data.total', '123.40')->assertJsonPath('data.coupon.code', 'WELCOME10');
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'coupon_code' => 'WELCOME10', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 1]]], $this->site())
            ->assertOk()->assertJsonPath('data.offer_error.code', 'coupon_min_order')->assertJsonPath('data.discount_total', null);
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'coupon_code' => 'NOPE', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 2]]], $this->site())
            ->assertJsonPath('data.offer_error.code', 'coupon_invalid');

        $id = $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'WELCOME10']), $this->site())->assertCreated()
            ->assertJsonPath('data.order.total', '123.40')->assertJsonPath('data.order.discount_total', '12.00')->json('data.order.id');
        // Same guest again: one use per guest.
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'WELCOME10']), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'coupon_used');
        // Another guest uses the second (last) use.
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'WELCOME10', 'customer' => ['name' => 'Ravi', 'phone' => '9811100001']]), $this->site())->assertCreated();
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'WELCOME10', 'customer' => ['name' => 'Neha', 'phone' => '9811100002']]), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'coupon_invalid');

        // Cancelling gives the use back.
        $orderId = $this->asTenant(fn () => Order::where('public_id', $id)->value('id'));
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$orderId}/status", ['status' => 'cancelled', 'note' => 'Guest called'])->assertOk();
        $this->assertSame(1, $this->asTenant(fn () => Coupon::first()->used_count));

        // Expired coupons stop working; POS-only coupons don't work online.
        $this->asTenant(fn () => Coupon::create(['code' => 'OLD', 'type' => 'flat', 'value' => 20, 'ends_at' => now()->subDay()]));
        $this->asTenant(fn () => Coupon::create(['code' => 'SHOP', 'type' => 'flat', 'value' => 20, 'online' => false]));
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'OLD', 'customer' => ['name' => 'Om', 'phone' => '9811100003']]), $this->site())->assertStatus(422)->assertJsonPath('message', 'This coupon has expired.');
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['coupon_code' => 'SHOP', 'customer' => ['name' => 'Om', 'phone' => '9811100003']]), $this->site())->assertStatus(422);

        // At the counter: coupon on a POS bill (flat ₹20 off ₹60 → taxable ₹40 + ₹2 GST + ₹10 = ₹52).
        $pos = $this->posOrder([$this->naan()])->json('data.id');
        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$pos], 'coupon_code' => 'shop'])->assertCreated()
            ->assertJsonPath('data.discount', '20.00')->assertJsonPath('data.total', '52.00')->assertJsonPath('data.discount_reason', 'Coupon SHOP');
    }

    public function test_points_are_earned_spent_with_a_phone_code_and_reversed(): void
    {
        $this->asTenant(fn () => app(Loyalty::class)->save(['enabled' => true, 'earn_per_100' => 10, 'point_value' => 1, 'min_redeem' => 20, 'max_redeem_percent' => 50]));

        // Earn: ₹500 food (≈ 8 naan, ₹480 + GST) → 10 points per ₹100.
        $id = $this->postJson('/api/v1/site/orders', $this->naanOrder([], 8), $this->site())->assertCreated()->json('data.order.id');
        $orderId = $this->asTenant(fn () => Order::where('public_id', $id)->value('id'));
        $this->complete($orderId);
        $customer = $this->asTenant(fn () => Customer::where('phone', '+919829012345')->first());
        $this->assertSame(50, $customer->loyalty_points); // ₹504 food → 50 points
        $this->assertSame(1, $customer->visits);
        $this->assertSame('514.00', $customer->total_spent); // incl. packaging

        // Online, points need a code sent to the phone.
        $this->postJson('/api/v1/site/loyalty/code', ['phone' => '98290 12345'], $this->site())->assertOk();
        Cache::put("loyalty-otp:{$this->tenant->id}:+919829012345", ['hash' => Hash::make('123456'), 'tries' => 0], now()->addMinutes(10));
        $this->postJson('/api/v1/site/loyalty/verify', ['phone' => '9829012345', 'code' => '000000'], $this->site())->assertStatus(422);
        $token = $this->postJson('/api/v1/site/loyalty/verify', ['phone' => '9829012345', 'code' => '123456'], $this->site())
            ->assertOk()->assertJsonPath('data.points', 50)->json('data.token');

        // 40 points on a ₹120 food bill (cap 50% = ₹60) → ₹40 off before GST.
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'phone' => '9829012345', 'loyalty' => ['token' => $token, 'points' => 40], 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 2]]], $this->site())
            ->assertJsonPath('data.loyalty.points', 40)->assertJsonPath('data.discount_total', '40.00');
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['loyalty' => ['token' => $token, 'points' => 10]]), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'loyalty_min');
        $this->postJson('/api/v1/site/orders', $this->naanOrder(['loyalty' => ['token' => $token, 'points' => 40], 'customer' => ['name' => 'Xavi', 'phone' => '9811100009']]), $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'loyalty_phone');
        $id2 = $this->postJson('/api/v1/site/orders', $this->naanOrder(['loyalty' => ['token' => $token, 'points' => 40]]), $this->site())->assertCreated()
            ->assertJsonPath('data.order.discount_total', '40.00')->json('data.order.id');
        $this->assertSame(10, $this->asTenant(fn () => Customer::find($customer->id)->loyalty_points));

        // A token from another business doesn't work here.
        $other = $this->business('Other Place', 'growth', ['status' => 'live']);
        app(\App\Modules\Tenancy\Support\TenantContext::class)->run($other, fn () => app(Loyalty::class)->save(['enabled' => true] + Loyalty::defaults()));
        $this->postJson('/api/v1/site/orders/quote', ['type' => 'takeaway', 'loyalty' => ['token' => $token, 'points' => 20], 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 2]]], ['X-Tenant-Host' => $this->host($other)])
            ->assertStatus(422);

        // Cancelled: the 40 points come back.
        $order2 = $this->asTenant(fn () => Order::where('public_id', $id2)->value('id'));
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson("/api/v1/tenant/orders/{$order2}/status", ['status' => 'cancelled', 'note' => 'Changed mind'])->assertOk();
        $this->assertSame(50, $this->asTenant(fn () => Customer::find($customer->id)->loyalty_points));

        // At the counter: staff use points for a guest by phone.
        $pos = $this->posOrder([$this->naan(2)])->json('data.id');
        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$pos], 'customer_phone' => '9829012345', 'points' => 30])->assertCreated()
            ->assertJsonPath('data.discount', '30.00')->assertJsonPath('data.discount_reason', '30 loyalty points');
        $this->assertSame(20, $this->asTenant(fn () => Customer::find($customer->id)->loyalty_points));
        $this->assertSame($customer->id, $this->asTenant(fn () => Order::find($pos)->customer_id));
        $this->assertSame(['earn', 'redeem', 'reverse', 'redeem'], $this->asTenant(fn () => LoyaltyEntry::orderBy('id')->pluck('type')->all()));

        // Owner corrections are logged.
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson("/api/v1/tenant/loyalty/customers/{$customer->id}/adjust", ['points' => 5, 'note' => 'Birthday'])->assertOk()->assertJsonPath('data.points', 25);
    }
}
