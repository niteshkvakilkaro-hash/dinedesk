<?php

namespace Tests\Feature\Reservations;

use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Notifications\NewReservationForStaff;
use App\Modules\Reservations\Notifications\ReservationMessage;
use App\Modules\Reservations\Services\Bookings;
use App\Modules\Reservations\Services\ReservationSettings;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tables\Models\DiningTable;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Ordering\OrderingTestCase;

/** Table bookings. "Now" is Tuesday 10 Nov 2026, 1 pm IST; open 11:00–23:00 every day. */
class ReservationTest extends OrderingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->reservationSettings(['enabled' => true, 'default_capacity' => 6]);
    }

    private function reservationSettings(array $changes): void
    {
        $this->asTenant(fn () => app(ReservationSettings::class)->save(array_replace(app(ReservationSettings::class)->get(), $changes)));
    }

    private int $visitor = 0;

    /** Each call comes from a different visitor, so the booking rate limit does not get in the way. */
    private function book(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.'.(++$this->visitor)])->postJson('/api/v1/site/reservations', array_replace([
            'date' => '2026-11-11', 'time' => '19:00', 'party_size' => 2,
            'name' => 'Meera Joshi', 'phone' => '98765 43210', 'email' => 'meera@example.com', 'notes' => 'Window seat if possible',
        ], $overrides), $this->site());
    }

    private function slot(string $date, int $party, string $time): ?array
    {
        $slots = $this->getJson("/api/v1/site/reservations/availability?date={$date}&party_size={$party}", $this->site())->assertOk()->json('data.slots');

        return collect($slots)->firstWhere('time', $time);
    }

    public function test_guest_books_staff_confirm_and_guest_checks_and_cancels(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);

        $slots = $this->getJson('/api/v1/site/reservations/availability?date=2026-11-11&party_size=2', $this->site())->assertOk()->json('data.slots');
        $this->assertSame('11:00', $slots[0]['time']);
        $this->assertSame('21:30', end($slots)['time']); // 23:00 close − 90 min stay
        $this->assertArrayNotHasKey('capacity', $slots[0]); // guests never see how full a slot is

        $res = $this->book()->assertCreated()->assertJsonPath('data.status', 'pending')->assertJsonPath('data.party_size', 2);
        $code = $res->json('data.code');
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $code);
        Notification::assertSentTo([$owner], NewReservationForStaff::class);
        Notification::assertSentTo(new AnonymousNotifiable(), ReservationMessage::class, fn ($n, $channels, $to) => $n->kind === 'received' && $to->routes['mail'] === 'meera@example.com' && str_contains($n->toText(), $code));

        $this->actingAsUser($owner)->getJson('/api/v1/tenant/reservations/feed?after=0')->assertJsonPath('data.pending', 1)->assertJsonCount(1, 'data.new');
        $id = $this->actingAsUser($owner)->getJson('/api/v1/tenant/reservations?date=2026-11-11')
            ->assertJsonPath('data.summary.guests', 2)->assertJsonPath('data.reservations.0.phone', '+919876543210')
            ->assertJsonPath('data.reservations.0.next', ['confirmed', 'rejected', 'cancelled'])->json('data.reservations.0.id');
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'confirmed'])->assertOk()->assertJsonPath('data.status', 'confirmed');
        Notification::assertSentTo(new AnonymousNotifiable(), ReservationMessage::class, fn ($n) => $n->kind === 'confirmed');

        // Guest side: booking ID + the phone used, in any format.
        $this->postJson('/api/v1/site/reservations/lookup', ['code' => $code, 'phone' => '9999999999'], $this->site())->assertNotFound();
        $this->postJson('/api/v1/site/reservations/lookup', ['code' => strtolower($code), 'phone' => '+91 98765-43210'], $this->site())
            ->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.cancellable', true);
        $this->postJson('/api/v1/site/reservations/cancel', ['code' => $code, 'phone' => '9876543210'], $this->site())->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson('/api/v1/site/reservations/cancel', ['code' => $code, 'phone' => '9876543210'], $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'not_cancellable');
        $this->assertDatabaseHas('reservations', ['code' => $code, 'cancelled_by' => 'guest']);
    }

    public function test_auto_confirm_and_reject_with_reason(): void
    {
        Notification::fake();
        $this->reservationSettings(['auto_confirm' => true]);
        $this->book()->assertCreated()->assertJsonPath('data.status', 'confirmed');

        $this->reservationSettings(['auto_confirm' => false]);
        $this->book(['time' => '20:00', 'phone' => '9876500003'])->assertCreated()->assertJsonPath('data.status', 'pending');
        $id = $this->asTenant(fn () => Reservation::where('status', 'pending')->value('id'));
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'rejected', 'note' => 'Private event that evening'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');
        Notification::assertSentTo(new AnonymousNotifiable(), ReservationMessage::class, fn ($n) => $n->kind === 'rejected' && str_contains($n->toText(), 'Private event'));
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $this->tenant->id, 'action' => 'reservation.rejected']);
        // Finished bookings can't move again.
        $this->actingAsUser($this->ownerOf($this->tenant))->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'confirmed'])->assertStatus(422);
    }

    public function test_slot_capacity_party_limits_lead_time_and_dates(): void
    {
        // Capacity 6 guests per slot.
        $this->book(['party_size' => 4])->assertCreated();
        $this->assertFalse($this->slot('2026-11-11', 3, '19:00')['available']);
        $this->assertTrue($this->slot('2026-11-11', 2, '19:00')['available']);
        $this->assertTrue($this->slot('2026-11-11', 3, '19:30')['available']);
        $this->book(['party_size' => 3, 'phone' => '9876500001'])->assertStatus(422)->assertJsonPath('meta.code', 'full');
        $this->book(['party_size' => 2, 'phone' => '9876500002'])->assertCreated();

        // Party size limits (online), lead time (now 1 pm + 60 min), booking window, blackout, holiday.
        $this->book(['party_size' => 11])->assertStatus(422)->assertJsonPath('meta.code', 'party_size');
        $this->assertFalse($this->slot('2026-11-10', 2, '13:30')['available']);
        $this->assertTrue($this->slot('2026-11-10', 2, '14:00')['available']);
        $this->book(['date' => '2026-11-10', 'time' => '13:30'])->assertStatus(422)->assertJsonPath('meta.code', 'too_soon');
        $this->book(['date' => '2026-11-09'])->assertStatus(422)->assertJsonPath('meta.code', 'past');
        $this->book(['date' => '2026-12-11'])->assertStatus(422)->assertJsonPath('meta.code', 'too_far');
        $this->book(['time' => '19:10'])->assertStatus(422)->assertJsonPath('meta.code', 'invalid_time');

        $this->reservationSettings(['blackout_dates' => [['date' => '2026-11-14', 'label' => 'Private event']]]);
        $this->getJson('/api/v1/site/reservations/availability?date=2026-11-14&party_size=2', $this->site())
            ->assertJsonPath('data.problem.code', 'blackout')->assertJsonCount(0, 'data.slots');
        $this->asTenant(fn () => app(TenantSettings::class)->set('holidays', [['date' => '2026-11-12', 'label' => 'Diwali']]));
        $this->book(['date' => '2026-11-12'])->assertStatus(422)->assertJsonPath('meta.code', 'holiday');

        // Switched off → no online bookings.
        $this->reservationSettings(['enabled' => false]);
        $this->book(['time' => '20:00'])->assertStatus(422)->assertJsonPath('meta.code', 'not_accepting');
    }

    public function test_bookings_are_matched_to_the_smallest_free_table(): void
    {
        $this->reservationSettings(['default_capacity' => 50]);
        $this->asTenant(function () {
            DiningTable::create(['label' => 'T1', 'seats' => 2]);
            DiningTable::create(['label' => 'T2', 'seats' => 4]);
        });
        $this->book()->assertCreated();
        $this->book(['phone' => '9876500001'])->assertCreated();
        // Both tables are held 19:00–20:30 now.
        $this->book(['party_size' => 3, 'phone' => '9876500002'])->assertStatus(422)->assertJsonPath('meta.code', 'no_table');
        $this->assertFalse($this->slot('2026-11-11', 2, '20:00')['available']);
        $this->assertTrue($this->slot('2026-11-11', 2, '20:30')['available']);
        // Nobody fits 6 at a 4-seat table.
        $this->assertFalse($this->slot('2026-11-12', 6, '19:00')['available']);

        $tables = $this->asTenant(fn () => Reservation::orderBy('id')->with('table')->get()->pluck('table.label')->all());
        $this->assertSame(['T1', 'T2'], $tables);

        // Staff can move a booking, but not onto a table that is too small or taken.
        $owner = $this->ownerOf($this->tenant);
        [$first, $second] = $this->asTenant(fn () => Reservation::orderBy('id')->pluck('id')->all());
        $t1 = $this->asTenant(fn () => DiningTable::where('label', 'T1')->value('id'));
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/reservations/{$second}/table", ['dining_table_id' => $t1])->assertStatus(422)->assertJsonPath('meta.code', 'table_taken');
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/reservations/{$first}/table", ['dining_table_id' => null])->assertOk()->assertJsonPath('data.table', null);
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/reservations/{$second}/table", ['dining_table_id' => $t1])->assertOk()->assertJsonPath('data.table.label', 'T1');
    }

    public function test_owner_sets_weekly_slots(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/reservations/settings')
            ->assertJsonPath('data.custom_slots', false)->assertJsonPath('data.slots.0', ['day' => 'mon', 'time' => '11:00', 'capacity' => 6, 'is_active' => true]);
        $this->actingAsUser($owner)->putJson('/api/v1/tenant/reservations/slots', ['slots' => [
            ['day' => 'wed', 'time' => '19:00', 'capacity' => 10, 'is_active' => true],
            ['day' => 'wed', 'time' => '21:00', 'capacity' => 10, 'is_active' => false],
        ]])->assertOk()->assertJsonPath('data.custom_slots', true);
        $this->actingAsUser($owner)->putJson('/api/v1/tenant/reservations/slots', ['slots' => [
            ['day' => 'wed', 'time' => '19:00', 'capacity' => 10, 'is_active' => true],
            ['day' => 'wed', 'time' => '19:00', 'capacity' => 4, 'is_active' => true],
        ]])->assertStatus(422);

        $this->app['auth']->forgetGuards();
        $wed = $this->getJson('/api/v1/site/reservations/availability?date=2026-11-11&party_size=8', $this->site())->json('data.slots');
        $this->assertSame([['time' => '19:00', 'available' => true]], $wed);
        $this->assertSame([], $this->getJson('/api/v1/site/reservations/availability?date=2026-11-12&party_size=2', $this->site())->json('data.slots'));

        $this->actingAsUser($owner)->putJson('/api/v1/tenant/reservations/settings', array_replace(app(ReservationSettings::class)::defaults(), ['min_party' => 4, 'max_party' => 2]))
            ->assertStatus(422);
    }

    public function test_staff_bookings_no_shows_and_reminders(): void
    {
        Notification::fake();
        $owner = $this->ownerOf($this->tenant);
        $res = $this->actingAsUser($owner)->postJson('/api/v1/tenant/reservations', [
            'date' => '2026-11-11', 'time' => '19:00', 'party_size' => 8, 'name' => 'Rao family', 'phone' => '9811122233', 'source' => 'phone',
        ])->assertStatus(422)->assertJsonPath('meta.code', 'full'); // capacity 6
        $id = $this->actingAsUser($owner)->postJson('/api/v1/tenant/reservations', [
            'date' => '2026-11-11', 'time' => '19:00', 'party_size' => 8, 'name' => 'Rao family', 'phone' => '9811122233', 'email' => 'rao@example.com', 'source' => 'phone', 'force' => true,
        ])->assertCreated()->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.source', 'phone')->json('data.id');
        Notification::assertNotSentTo([$owner], NewReservationForStaff::class);

        $this->actingAsUser($owner)->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'no_show'])->assertStatus(422)->assertJsonPath('meta.code', 'too_early');

        // 16:30 the next day: 2.5 hours before → reminder (3 hours set), once.
        $this->travelTo(CarbonImmutable::parse('2026-11-11 16:30', 'Asia/Kolkata'));
        $this->assertSame(1, $this->asTenant(fn () => app(Bookings::class)->sendReminders()));
        $this->assertSame(0, $this->asTenant(fn () => app(Bookings::class)->sendReminders()));
        Notification::assertSentTo(new AnonymousNotifiable(), ReservationMessage::class, fn ($n) => $n->kind === 'reminder' && str_contains($n->toText(), '8 guests'));

        $this->travelTo(CarbonImmutable::parse('2026-11-11 19:45', 'Asia/Kolkata'));
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'no_show'])->assertOk()->assertJsonPath('data.status', 'no_show');
    }

    public function test_reservations_are_private_to_each_business_and_role(): void
    {
        $code = $this->book()->assertCreated()->json('data.code');
        $other = $this->business('Other Place', 'growth', ['status' => 'live']);
        app(\App\Modules\Tenancy\Support\TenantContext::class)->run($other, fn () => app(ReservationSettings::class)->save(array_replace(ReservationSettings::defaults(), ['enabled' => true])));

        $this->postJson('/api/v1/site/reservations/lookup', ['code' => $code, 'phone' => '9876543210'], ['X-Tenant-Host' => $this->host($other)])->assertNotFound();
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/reservations?date=2026-11-11')->assertJsonCount(0, 'data.reservations');
        $id = $this->asTenant(fn () => Reservation::value('id'));
        $this->actingAsUser($this->ownerOf($other))->postJson("/api/v1/tenant/reservations/{$id}/status", ['status' => 'confirmed'])->assertNotFound();

        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/reservations')->assertForbidden();
        $this->actingAsUser($this->staff($this->tenant, 'front_desk'))->getJson('/api/v1/tenant/reservations?date=2026-11-11')->assertOk()->assertJsonCount(1, 'data.reservations');
    }
}
