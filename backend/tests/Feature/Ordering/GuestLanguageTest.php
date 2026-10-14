<?php

namespace Tests\Feature\Ordering;

use App\Modules\Hotel\Notifications\StayMessage;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Notifications\OrderMessage;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Notifications\ReservationMessage;
use App\Modules\Reservations\Services\ReservationSettings;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;

/** Guest messages go out in the language the guest used on the site (X-Locale). */
class GuestLanguageTest extends OrderingTestCase
{
    public function test_order_placed_in_tamil_is_stored_and_messaged_in_tamil(): void
    {
        Notification::fake();

        $id = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site() + ['X-Locale' => 'ta'])
            ->assertCreated()->json('data.order.id');

        $this->assertSame('ta', Order::withoutTenancy()->where('public_id', $id)->value('locale'));
        Notification::assertSentTo(new AnonymousNotifiable(), OrderMessage::class, function (OrderMessage $n) {
            $mail = $n->toMail(new AnonymousNotifiable());

            return $n->kind === 'placed'
                && $n->toText() === 'Spice Route: உங்கள் ஆர்டர் #1001 (₹787.00) கிடைத்தது. இங்கே டிராக் செய்யுங்கள்: '.$n->trackUrl
                && $mail->subject === 'Spice Route — ஆர்டர் #1001'
                && $mail->actionText === 'ஆர்டரைப் பார்க்க';
        });
    }

    public function test_unsupported_language_falls_back_to_english_and_regional_codes_use_the_base_language(): void
    {
        Notification::fake();

        $first = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site() + ['X-Locale' => 'xx'])->assertCreated()->json('data.order.id');
        $second = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site() + ['X-Locale' => 'bn-IN'])->assertCreated()->json('data.order.id');
        $third = $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated()->json('data.order.id');

        $this->assertSame('en', Order::withoutTenancy()->where('public_id', $first)->value('locale'));
        $this->assertSame('bn', Order::withoutTenancy()->where('public_id', $second)->value('locale'));
        $this->assertSame('en', Order::withoutTenancy()->where('public_id', $third)->value('locale'));
        Notification::assertSentTo(new AnonymousNotifiable(), OrderMessage::class, fn (OrderMessage $n) => str_starts_with($n->toText(), 'Spice Route: we have received your order #1001'));
    }

    public function test_table_booking_in_tamil_is_stored_and_messaged_in_tamil(): void
    {
        Notification::fake();
        $this->asTenant(fn () => app(ReservationSettings::class)->save(array_replace(app(ReservationSettings::class)->get(), ['enabled' => true, 'default_capacity' => 6])));

        $code = $this->postJson('/api/v1/site/reservations', [
            'date' => '2026-11-11', 'time' => '19:00', 'party_size' => 2,
            'name' => 'Meera Joshi', 'phone' => '98765 43210', 'email' => 'meera@example.com',
        ], $this->site() + ['X-Locale' => 'ta'])->assertCreated()->json('data.code');

        $this->assertSame('ta', Reservation::withoutTenancy()->where('code', $code)->value('locale'));
        Notification::assertSentTo(new AnonymousNotifiable(), ReservationMessage::class, fn (ReservationMessage $n) => $n->kind === 'received'
            && str_starts_with($n->toText(), 'Spice Route: Wed 11 Nov, 7:00 PM, 2 பேருக்கு டேபிள் கோரிக்கை கிடைத்தது. புக்கிங் ID '.$code));
    }

    public function test_counts_and_reasons_follow_each_language(): void
    {
        $table = fn (string $locale, int $party, string $kind = 'received', ?string $reason = null) => (new ReservationMessage(
            ['code' => 'AB12CD', 'party' => $party, 'when' => 'Wed 11 Nov, 7:00 PM', 'locale' => $locale, 'reason' => $reason], $kind, 'Spice Route', 'https://x.test/r', ['mail'],
        ))->toText();
        $this->assertStringContainsString('for 1 guest on', $table('en', 1));
        $this->assertStringContainsString('for 8 guests on', $table('en', 8));
        $this->assertStringContainsString('1 व्यक्ति की टेबल', $table('hi', 1));
        $this->assertStringContainsString('8 लोगों की टेबल', $table('hi', 8));
        $this->assertStringEndsWith('has been cancelled. Reason: Kitchen closed', $table('en', 2, 'cancelled', 'Kitchen closed'));
        $this->assertStringEndsWith('रद्द हो गई है। कारण: Kitchen closed', $table('hi', 2, 'cancelled', 'Kitchen closed'));
        $this->assertStringEndsWith('ரத்து செய்யப்பட்டது.', $table('ta', 2, 'cancelled'));

        $stay = fn (string $locale, int $nights) => (new StayMessage(
            ['code' => 'RM1234', 'dates' => '11–12 Nov', 'nights' => $nights, 'checkin' => '12:00 PM', 'locale' => $locale, 'reason' => null], 'confirmed', 'Spice Route', 'https://x.test/s', ['mail'],
        ))->toText();
        $this->assertStringContainsString('(1 night)', $stay('en', 1));
        $this->assertStringContainsString('(3 nights)', $stay('en', 3));
        $this->assertStringContainsString('(3 இரவுகள்)', $stay('ta', 3));
        $this->assertStringContainsString('(3 رات)', $stay('ur', 3));
        $this->assertStringContainsString('(2 nights)', $stay('xx', 2));
    }
}
