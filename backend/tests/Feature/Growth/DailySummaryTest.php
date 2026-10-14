<?php

namespace Tests\Feature\Growth;

use App\Models\User;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Reports\Notifications\DailySummaryMessage;
use App\Modules\Reports\Services\DailySummary;
use App\Modules\Reservations\Models\Reservation;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/**
 * The owner's morning summary of yesterday: same numbers as the Reports page, sent once at the
 * hour the owner chose (business time), in the owner's language, only when switched on.
 * Yesterday = Mon 9 Nov 2026 (IST).
 */
class DailySummaryTest extends OperationsTestCase
{
    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = $this->ownerOf($this->tenant);
        $this->owner->update(['phone' => '+919829000001', 'email' => 'owner@spiceroute.test']);
    }

    /** Monday's trade: three POS orders (one cancelled), a table booking, and one low raw material. */
    private function yesterday(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 13:00', 'Asia/Kolkata'));
        $this->posOrder([$this->naan(3), $this->lassi()])->assertCreated();
        $this->posOrder([$this->naan(2)], 'dine_in', 'T1')->assertCreated();
        $cancel = $this->posOrder([$this->lassi(4)])->json('data.id');
        $this->actingAsUser($this->owner)->postJson("/api/v1/tenant/orders/{$cancel}/status", ['status' => 'cancelled', 'note' => 'x'])->assertOk();
        $this->asTenant(function () {
            Reservation::create(['code' => 'R1', 'name' => 'Asha', 'phone' => '+919829011111', 'party_size' => 4, 'date' => '2026-11-09', 'time' => '20:00',
                'starts_at' => CarbonImmutable::parse('2026-11-09 20:00', 'Asia/Kolkata'), 'ends_at' => CarbonImmutable::parse('2026-11-09 21:30', 'Asia/Kolkata'), 'status' => 'completed', 'source' => 'website']);
            InventoryItem::create(['name' => 'Paneer', 'unit' => 'kg', 'stock' => 1, 'low_stock_level' => 2]);
            InventoryItem::create(['name' => 'Rice', 'unit' => 'kg', 'stock' => 50, 'low_stock_level' => 5]);
        });
        $this->app['auth']->forgetGuards();
    }

    private function switchOn(array $patch = []): void
    {
        $s = $this->actingAsUser($this->owner)->getJson('/api/v1/tenant/reports/daily-summary')->assertOk()
            ->assertJsonPath('data.settings.enabled', false)->json('data.settings');
        $this->putJson('/api/v1/tenant/reports/daily-summary', array_replace($s, ['enabled' => true, 'email' => true, 'hour' => 9], $patch))->assertOk()
            ->assertJsonPath('data.settings.enabled', true);
        $this->app['auth']->forgetGuards();
    }

    private function at(string $time): void
    {
        $this->travelTo(CarbonImmutable::parse($time, 'Asia/Kolkata'));
    }

    public function test_numbers_match_the_reports_page_and_it_goes_once_at_the_chosen_hour(): void
    {
        $this->yesterday();
        $this->at('2026-11-10 08:00');
        $this->switchOn();

        $this->artisan('reports:daily-summary')->assertSuccessful();
        Notification::assertNotSentTo(new AnonymousNotifiable, DailySummaryMessage::class);

        $this->at('2026-11-10 09:00');
        $this->artisan('reports:daily-summary')->assertSuccessful();
        Notification::assertSentTimes(DailySummaryMessage::class, 1);

        // Same calculation as Dashboard → Reports for Monday alone.
        $r = $this->actingAsUser($this->owner)->getJson('/api/v1/tenant/reports/overview?from=2026-11-09&to=2026-11-09')->assertOk()->json('data');
        $this->assertSame(2, $r['totals']['orders']);
        $sent = null;
        Notification::assertSentTo(new AnonymousNotifiable, DailySummaryMessage::class, function ($n, $channels, $to) use (&$sent) {
            $sent = $n;

            return $channels === ['whatsapp', 'mail'] && $to->routes['whatsapp'] === '+919829000001' && $to->routes['mail'] === 'owner@spiceroute.test';
        });
        $text = $sent->text;
        $this->assertStringStartsWith('Spice Route · summary for Mon, 9 Nov', $text);
        $this->assertStringContainsString('Orders: 2 · Sales: ₹'.DailySummary::inr($r['totals']['sales']), $text);
        foreach ($r['by_type'] as $g) {
            $this->assertStringContainsString('₹'.DailySummary::inr($g['sales'])." ({$g['orders']})", $text);
        }
        $this->assertStringContainsString('Top dishes: Butter Naan ×5, Lassi ×1', $text); // the cancelled Lassi ×4 doesn't count
        $this->assertStringContainsString('Table bookings: 1 · guests: 4', $text);
        $this->assertStringContainsString('Low stock (1): Paneer', $text);
        $this->assertStringContainsString('/dashboard/reports', $text);
        $this->assertStringNotContainsString('Rooms', $text); // no hotel on this plan
        $this->assertLessThan(700, mb_strlen($sent->toText()));
        $this->assertStringNotContainsString("\n", $sent->toText()); // WhatsApp template variables can't hold new lines

        // The rest of the morning, and running twice: nothing more. Next morning: one more.
        $this->artisan('reports:daily-summary')->assertSuccessful();
        $this->at('2026-11-10 10:00');
        $this->artisan('reports:daily-summary')->assertSuccessful();
        Notification::assertSentTimes(DailySummaryMessage::class, 1);
        $this->at('2026-11-11 09:00');
        $this->artisan('reports:daily-summary')->assertSuccessful();
        Notification::assertSentTimes(DailySummaryMessage::class, 2);
        Notification::assertSentTo(new AnonymousNotifiable, DailySummaryMessage::class, fn ($n) => str_contains($n->text, 'summary for Tue, 10 Nov') && str_contains($n->text, 'No orders on this day.'));
    }

    public function test_nothing_when_switched_off_suspended_read_only_or_demo(): void
    {
        $this->yesterday();
        $this->at('2026-11-10 09:00');
        $this->artisan('reports:daily-summary')->assertSuccessful(); // never switched on (off by default)
        $this->switchOn();
        $s = $this->actingAsUser($this->owner)->getJson('/api/v1/tenant/reports/daily-summary')->json('data.settings');
        $this->putJson('/api/v1/tenant/reports/daily-summary', ['enabled' => false] + $s)->assertOk();
        $this->artisan('reports:daily-summary')->assertSuccessful();

        $this->switchOn();
        foreach ([['status' => 'suspended'], ['status' => 'read_only'], ['status' => 'live', 'is_demo' => true]] as $attrs) {
            $this->tenant->update($attrs);
            $this->artisan('reports:daily-summary')->assertSuccessful();
        }
        Notification::assertNotSentTo(new AnonymousNotifiable, DailySummaryMessage::class);

        $this->tenant->update(['status' => 'live', 'is_demo' => false]);
        $this->artisan('reports:daily-summary')->assertSuccessful();
        Notification::assertSentTimes(DailySummaryMessage::class, 1);
    }

    public function test_written_in_the_owners_language_on_the_chosen_channel(): void
    {
        $this->yesterday();
        $this->owner->update(['locale' => 'ta']);
        $this->at('2026-11-10 07:00');
        $this->switchOn(['hour' => 7, 'email' => false]);
        $this->artisan('reports:daily-summary')->assertSuccessful();

        Notification::assertSentTo(new AnonymousNotifiable, DailySummaryMessage::class, function ($n, $channels) {
            return $channels === ['whatsapp']
                && str_contains($n->text, 'Spice Route · திங்', ) // Monday in Tamil
                && str_contains($n->text, 'ஆர்டர்கள்: 2 · விற்பனை: ₹')
                && str_contains($n->text, 'குறைந்த இருப்பு (1): Paneer')
                && ! preg_match('/[^\P{Nd}0-9]/u', $n->text); // Western digits
        });
    }

    public function test_settings_rules_and_the_test_button(): void
    {
        $this->yesterday();
        $this->at('2026-11-10 12:00');
        $this->posOrder([$this->naan(1)])->assertCreated(); // today so far
        $this->app['auth']->forgetGuards();

        // Owners and managers only.
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/reports/daily-summary')->assertForbidden();
        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/reports/daily-summary/test')->assertForbidden();

        $manager = $this->staff($this->tenant, 'manager');
        $page = $this->actingAsUser($manager)->getJson('/api/v1/tenant/reports/daily-summary')->assertOk()
            ->assertJsonPath('data.owner.phone', '+919829000001')->assertJsonPath('data.hours', DailySummary::HOURS);
        $this->assertStringContainsString('Orders: 2 · Sales: ₹', $page->json('data.preview')); // yesterday, as tomorrow's message would say
        $s = $page->json('data.settings');
        $this->putJson('/api/v1/tenant/reports/daily-summary', ['hour' => 6] + $s)->assertStatus(422);
        $this->putJson('/api/v1/tenant/reports/daily-summary', ['enabled' => true, 'whatsapp' => false, 'email' => false] + $s)->assertStatus(422)->assertJsonValidationErrors('whatsapp');

        // The test goes to the owner (not the manager pressing it), with today so far, even while switched off.
        $this->postJson('/api/v1/tenant/reports/daily-summary/test')->assertOk()->assertJsonPath('data.channels', ['whatsapp']);
        Notification::assertSentTo(new AnonymousNotifiable, DailySummaryMessage::class, fn ($n, $channels, $to) => $to->routes['whatsapp'] === '+919829000001'
            && str_starts_with($n->text, 'Spice Route · today so far (Tue, 10 Nov, 12:00)') && str_contains($n->text, 'Orders: 1 · Sales: ₹'));
        // Not counted as the day's summary.
        $this->assertNull($this->asTenant(fn () => app(DailySummary::class)->lastSentOn()));

        $this->actingAsUser($manager);
        for ($i = 2; $i <= 5; $i++) {
            $this->postJson('/api/v1/tenant/reports/daily-summary/test')->assertOk();
        }
        $this->postJson('/api/v1/tenant/reports/daily-summary/test')->assertStatus(429);
        Notification::assertSentTimes(DailySummaryMessage::class, 5);
    }

    public function test_test_button_explains_when_there_is_nowhere_to_send(): void
    {
        $this->owner->update(['phone' => null]);
        $this->actingAsUser($this->owner)->postJson('/api/v1/tenant/reports/daily-summary/test')->assertStatus(422)->assertJsonPath('meta.code', 'no_channel');
        Notification::assertNothingSent();
    }
}
