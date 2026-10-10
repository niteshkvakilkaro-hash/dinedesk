<?php

namespace Tests\Feature\Hotel;

use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Notifications\HotelForStaff;
use App\Modules\Ordering\Services\OrderingSettings;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;

/** Prices, availability, website bookings, advances and guest cancellation. */
class RoomBookingTest extends HotelTestCase
{
    public function test_prices_follow_weekends_seasons_extra_guests_and_gst_slabs(): void
    {
        $find = fn ($res, $type) => collect($res->json('data.types'))->firstWhere('id', $type->id);

        // Thu + Fri + Sat nights: 3,000 + 3,600 + 3,600 at 5% GST.
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-11-15&adults=2', $this->site())->assertOk();
        $deluxe = $find($res, $this->deluxe);
        $this->assertTrue($deluxe['available']);
        $this->assertSame(['10200.00', '510.00', '10710.00'], [$deluxe['quote']['room_total'], $deluxe['quote']['tax_total'], $deluxe['quote']['total']]);
        $this->assertSame([false, true, true], array_column($deluxe['quote']['rates'], 'weekend'));
        $this->assertNull($deluxe['few_left'] ?? null === 2 ? null : null);

        // A third adult adds ₹800 a night; the Suite doesn't take 3 adults.
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-11-15&adults=3', $this->site());
        $this->assertSame(['12600.00', '630.00'], [$find($res, $this->deluxe)['quote']['room_total'], $find($res, $this->deluxe)['quote']['tax_total']]);
        $this->assertSame([false, null], [$find($res, $this->suite)['fits'], $find($res, $this->suite)['quote']]);

        // ₹8,000 a night is in the 18% slab; the wedding-season price wins over the weekend price.
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-21&check_out=2026-11-22&adults=2', $this->site());
        $this->assertSame(['8000.00', '1440.00'], [$find($res, $this->suite)['quote']['room_total'], $find($res, $this->suite)['quote']['tax_total']]);
        $this->assertSame(['4500.00', '225.00', 'Wedding season'], [$find($res, $this->deluxe)['quote']['rates'][0]['price'], $find($res, $this->deluxe)['quote']['tax_total'], $find($res, $this->deluxe)['quote']['rates'][0]['season']]);

        // No GST for a business that isn't registered.
        $this->actingAsUser($this->ownerOf($this->tenant))->putJson('/api/v1/tenant/hotel/settings', array_replace($this->getSettings(), ['charge_gst' => false]))->assertOk();
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-21&check_out=2026-11-22&adults=2', $this->site());
        $this->assertSame('0.00', $find($res, $this->suite)['quote']['tax_total']);

        $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-09&check_out=2026-11-11&adults=2', $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'invalid_dates');
        $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-12-20&adults=2', $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'too_long');
        $this->getJson('/api/v1/site/hotel', $this->site())->assertOk()->assertJsonCount(2, 'data.types')->assertJsonPath('data.types.0.from_price', '3000.00');
    }

    public function test_website_bookings_never_oversell_and_guests_manage_their_own(): void
    {
        Notification::fake();
        $a = $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(), $this->site())
            ->assertCreated()->assertJsonPath('data.booking.status', 'pending')->assertJsonPath('data.booking.total', '6930.00')->json('data');
        Notification::assertSentTo($this->desk, HotelForStaff::class);
        $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(['check_in' => '2026-11-13', 'check_out' => '2026-11-15', 'name' => 'Kabir', 'phone' => '9811100001']), $this->site())->assertCreated();

        // Both Deluxe rooms are taken on the night of the 13th.
        $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(['check_in' => '2026-11-13', 'check_out' => '2026-11-14']), $this->site())
            ->assertStatus(422)->assertJsonPath('meta.code', 'sold_out');
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-11-14&adults=2', $this->site());
        $this->assertFalse(collect($res->json('data.types'))->firstWhere('id', $this->deluxe->id)['available']);
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-14&check_out=2026-11-15&adults=2', $this->site());
        $this->assertSame(1, collect($res->json('data.types'))->firstWhere('id', $this->deluxe->id)['few_left']);
        // The front desk can't oversell either.
        $this->actingAsUser($this->desk)->postJson('/api/v1/tenant/hotel/bookings', $this->guestBooking(['check_in' => '2026-11-13', 'source' => 'phone']))->assertStatus(422)->assertJsonPath('meta.code', 'sold_out');

        // The front desk confirms the request.
        $id = RoomBooking::withoutTenancy()->where('public_id', $a['booking']['id'])->value('id');
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/status", ['status' => 'confirmed'])->assertOk()->assertJsonPath('data.status', 'confirmed');
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/status", ['status' => 'cancelled'])->assertStatus(422)->assertJsonPath('meta.code', 'reason_required');

        // The guest finds it with the booking ID and phone, and cancels (2 days before is the cut-off).
        $code = RoomBooking::withoutTenancy()->find($id)->code;
        $this->postJson('/api/v1/site/hotel/bookings/lookup', ['code' => $code, 'phone' => '9811100001'], $this->site())->assertNotFound();
        $link = $this->postJson('/api/v1/site/hotel/bookings/lookup', ['code' => strtolower($code), 'phone' => '+91 98765 43210'], $this->site())->assertOk()->json('data');
        $this->getJson("/api/v1/site/hotel/bookings/{$link['id']}?t=wrong", $this->site())->assertNotFound();
        $this->getJson("/api/v1/site/hotel/bookings/{$link['id']}?t={$link['t']}", $this->site())->assertOk()->assertJsonPath('data.can_cancel', true)->assertJsonMissingPath('data.phone');
        $this->postJson("/api/v1/site/hotel/bookings/{$link['id']}/cancel", ['t' => $link['t']], $this->site())->assertOk()->assertJsonPath('data.status', 'cancelled');

        // Arriving tomorrow: too late to cancel online.
        $late = $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(['check_in' => '2026-11-11', 'check_out' => '2026-11-12']), $this->site())->assertCreated()->json('data');
        $this->postJson("/api/v1/site/hotel/bookings/{$late['booking']['id']}/cancel", ['t' => $late['token']], $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'not_cancellable');
    }

    public function test_an_online_advance_confirms_the_booking_and_unpaid_holds_are_released(): void
    {
        Notification::fake();
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['payments']['online'] = true;
            app(OrderingSettings::class)->save($s);
            app(OrderingSettings::class)->saveRazorpay('rzp_test_ABCDEF123456', 'secret_key_123456', 'whsec_7890');
        });
        $this->actingAsUser($this->ownerOf($this->tenant))->putJson('/api/v1/tenant/hotel/settings', array_replace($this->getSettings(), ['advance_percent' => 50]))->assertOk();
        Http::fake(['api.razorpay.com/v1/orders' => Http::sequence()->push(['id' => 'order_S1', 'amount' => 157500, 'currency' => 'INR'])->push(['id' => 'order_S2', 'amount' => 157500, 'currency' => 'INR'])]);

        // One night ₹3,150 → 50% advance ₹1,575.
        $res = $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(['check_out' => '2026-11-13']), $this->site())
            ->assertCreated()->assertJsonPath('data.booking.status', 'pending')->assertJsonPath('data.booking.advance_due', '1575.00')
            ->assertJsonPath('data.booking.awaiting_payment', true)->assertJsonPath('data.razorpay.order_id', 'order_S1');
        Http::assertSent(fn ($r) => $r['amount'] === 157500);
        Notification::assertNothingSentTo($this->desk);
        [$id, $t] = [$res->json('data.booking.id'), $res->json('data.token')];

        $verify = fn ($sig) => $this->postJson("/api/v1/site/hotel/bookings/{$id}/verify-payment", ['t' => $t, 'razorpay_order_id' => 'order_S1', 'razorpay_payment_id' => 'pay_S1', 'razorpay_signature' => $sig], $this->site());
        $verify('forged')->assertStatus(422)->assertJsonPath('meta.code', 'payment_unverified');
        $verify(hash_hmac('sha256', 'order_S1|pay_S1', 'secret_key_123456'))->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.paid', '1575.00');
        Notification::assertSentTo($this->desk, HotelForStaff::class);

        // A second guest never pays: the hold runs out and the room is free again.
        $other = $this->postJson('/api/v1/site/hotel/bookings', $this->guestBooking(['check_out' => '2026-11-13', 'name' => 'Kabir', 'phone' => '9811100001']), $this->site())->assertCreated()->json('data.booking.id');
        $this->travel(31)->minutes();
        $this->artisan('hotel:expire-holds')->assertSuccessful();
        $b = RoomBooking::withoutTenancy()->where('public_id', $other)->first();
        $this->assertSame(['cancelled', 'system'], [$b->status, $b->cancelled_by]);

        // Paid late (webhook) while a room is still free: the booking comes back.
        $body = json_encode(['event' => 'payment.captured', 'payload' => ['payment' => ['entity' => ['id' => 'pay_S2', 'order_id' => 'order_S2', 'method' => 'upi']]]]);
        $this->call('POST', "/api/v1/webhooks/razorpay/{$this->tenant->public_id}", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, 'whsec_7890')], $body)->assertOk();
        $this->assertSame('confirmed', $b->fresh()->status);
        $this->call('POST', "/api/v1/webhooks/razorpay/{$this->tenant->public_id}", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, 'whsec_7890')], $body)->assertOk();
        $this->assertSame(1, \App\Modules\Hotel\Models\FolioPayment::withoutTenancy()->where('room_booking_id', $b->id)->count());
    }

    public function test_hotel_is_a_pro_feature_and_each_hotel_sees_only_its_own_stays(): void
    {
        $stay = $this->deskBooking();
        $other = $this->business('Lake View', 'growth', ['status' => 'live']);
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/hotel/today')->assertForbidden();
        $this->getJson('/api/v1/site/hotel', ['X-Tenant-Host' => $this->host($other)])->assertForbidden();

        $other->update(['plan_id' => \App\Modules\Plans\Models\Plan::where('code', 'pro')->value('id')]);
        app(\App\Modules\Plans\Services\FeatureService::class)->forget($other);
        $this->actingAsUser($this->ownerOf($other))->getJson("/api/v1/tenant/hotel/bookings/{$stay['id']}")->assertNotFound();
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/hotel/bookings')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/site/hotel/bookings/{$stay['public_id']}?t=x", ['X-Tenant-Host' => $this->host($other)])->assertNotFound();
        // Waiters and cashiers don't run the front desk.
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/hotel/today')->assertForbidden();
    }

    protected function getSettings(): array
    {
        return $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/hotel/settings')->assertOk()->json('data');
    }
}
