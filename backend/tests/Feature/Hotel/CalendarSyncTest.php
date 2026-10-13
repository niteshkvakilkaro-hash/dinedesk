<?php

namespace Tests\Feature\Hotel;

use App\Modules\Hotel\Models\RoomCalendarFeed;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;

/** Calendar sync (iCal) with booking sites: their bookings hold a room here; full nights go out. */
class CalendarSyncTest extends HotelTestCase
{
    private const SITE_CAL = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Booking site//EN\r\n"
        ."BEGIN:VEVENT\r\nUID:abc-1@site\r\nDTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261114\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n"
        ."BEGIN:VEVENT\r\nUID:abc-2@site\r\nDTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n"
        ."BEGIN:VEVENT\r\nUID:abc-3@site\r\nDTSTART:20261125T083000Z\r\nDTEND:20261126T053000Z\r\nSUMMARY:Airbnb (Not\r\n  available)\r\nEND:VEVENT\r\n"
        ."BEGIN:VEVENT\r\nUID:old@site\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261003\r\nEND:VEVENT\r\n"
        ."END:VCALENDAR\r\n";

    public function test_a_booking_sites_calendar_holds_rooms_and_full_nights_go_out(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-01 10:00', 'Asia/Kolkata'));
        Http::fake(['93.184.216.34/*' => Http::response(self::SITE_CAL, 200, ['Content-Type' => 'text/calendar'])]);
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner);

        $url = $this->getJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}/calendar-sync")->assertOk()->json('data.export_url');
        $this->assertMatchesRegularExpression('#/api/v1/ical/[A-Za-z0-9]{40}\.ics$#', $url);
        $path = parse_url($url, PHP_URL_PATH);
        $this->assertStringNotContainsString('BEGIN:VEVENT', $this->get($path)->assertOk()->assertHeader('Content-Type', 'text/calendar; charset=utf-8')->getContent());

        // Links into this server's own network are refused.
        $this->postJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}/calendar-sync/feeds", ['name' => 'Bad', 'url' => 'http://127.0.0.1/calendar.ics'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'calendar_bad_link');

        // Added and read at once: the cancelled and past events are left out.
        $res = $this->postJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}/calendar-sync/feeds", ['name' => 'Airbnb', 'url' => 'https://93.184.216.34/calendar/ical/123.ics?s=secret'])
            ->assertCreated()->json('data');
        $this->assertSame(2, $res['feeds'][0]['events']);
        $this->assertStringNotContainsString('secret', $res['feeds'][0]['link']);
        $this->assertNull($res['feeds'][0]['error']);

        // Two Deluxe rooms: the site's booking holds one, a desk booking the other → sold out those nights.
        $find = fn () => collect($this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-11-14&adults=2', $this->site())->json('data.types'))->firstWhere('id', $this->deluxe->id);
        $this->assertTrue($find()['available']);
        $this->deskBooking(['check_in' => '2026-11-12', 'check_out' => '2026-11-14']);
        $this->assertFalse($find()['available']);

        // Those nights go out as "not available"; the front desk sees the site's booking.
        $ics = $this->get($path)->getContent();
        $this->assertStringContainsString("DTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261114", $ics);
        $this->assertStringNotContainsString('Rohan', $ics);
        $this->actingAsUser($this->desk);
        $external = collect($this->getJson('/api/v1/tenant/hotel/calendar?from=2026-11-10&days=20')->assertOk()->json('data.types'))->firstWhere('id', $this->deluxe->id)['external'];
        $this->assertSame([['Airbnb', '2026-11-12', '2026-11-14'], ['Airbnb', '2026-11-25', '2026-11-26']], array_map(fn ($b) => [$b['source'], $b['check_in'], $b['check_out']], $external));

        // A new link: the old one stops working.
        $this->actingAsUser($owner);
        $newUrl = $this->postJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}/calendar-sync/renew")->assertOk()->json('data.export_url');
        $this->assertNotSame($url, $newUrl);
        $this->get($path)->assertNotFound();

        // Front desk staff can't change calendar links.
        $this->actingAsUser($this->desk)->getJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}/calendar-sync")->assertForbidden();
    }

    public function test_a_link_that_is_not_a_calendar_is_noted_and_the_scheduled_sync_runs(): void
    {
        // First read: a login page; the scheduled read later: the calendar.
        Http::fakeSequence('93.184.216.34/*')->push('<html>Login</html>', 200)->push(self::SITE_CAL, 200);
        $this->actingAsUser($this->ownerOf($this->tenant));
        $this->postJson("/api/v1/tenant/hotel/types/{$this->suite->id}/calendar-sync/feeds", ['name' => 'Booking.com', 'url' => 'https://93.184.216.34/ical.ics'])
            ->assertCreated()->assertJsonPath('data.feeds.0.error', 'This link is not a calendar (.ics) file.');

        $this->artisan('hotel:calendar-sync')->assertExitCode(0);
        $this->assertNull($this->asTenant(fn () => RoomCalendarFeed::first()->error));
    }
}
