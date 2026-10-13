<?php

namespace App\Modules\Hotel\Services;

use App\Modules\Hotel\Models\RoomBlock;
use App\Modules\Hotel\Models\RoomCalendarFeed;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\UriInterface;
use Throwable;

/**
 * Calendar sync (iCal) with booking sites such as Airbnb, Booking.com homes and Agoda Homes.
 *
 * Out: each room type has a private link (an .ics file) listing the nights when no room of
 * that type is free, so the site closes those dates. In: a site's calendar link is read every
 * 30 minutes; each of its bookings holds one room of the type for its nights. Only dates are
 * shared: no guest names or details go out.
 */
class CalendarSync
{
    public const DAYS_AHEAD = 365;

    private const MAX_BYTES = 2 * 1024 * 1024;

    public function __construct(private readonly RoomAvailability $availability) {}

    public function token(RoomType $type, bool $renew = false): string
    {
        if ($renew || ! $type->ical_token) {
            $type->forceFill(['ical_token' => Str::random(40)])->save();
        }

        return $type->ical_token;
    }

    public function exportUrl(RoomType $type): string
    {
        return rtrim((string) config('app.url'), '/').'/api/v1/ical/'.$this->token($type).'.ics';
    }

    /** The .ics for a room type: one all-day event per run of nights with no room free. */
    public function export(Tenant $tenant, RoomType $type): string
    {
        $from = CarbonImmutable::now($tenant->timezone)->startOfDay();
        $to = $from->addDays(self::DAYS_AHEAD);
        $in = $from->format('Y-m-d');
        $out = $to->format('Y-m-d');
        $rooms = $this->availability->sellableRooms($type->id);
        $held = RoomAvailability::overlapping($in, $out)->where('room_type_id', $type->id)->get(['check_in', 'check_out'])->toBase()
            ->concat(RoomAvailability::blocks($in, $out)->where('room_type_id', $type->id));

        $runs = [];
        $start = null;
        for ($d = $from; $d->lt($to); $d = $d->addDay()) {
            $night = $d->format('Y-m-d');
            $taken = $held->filter(fn ($b) => $b->check_in->format('Y-m-d') <= $night && $b->check_out->format('Y-m-d') > $night)->count();
            $full = $taken >= $rooms;
            if ($full && ! $start) {
                $start = $d;
            } elseif (! $full && $start) {
                $runs[] = [$start, $d];
                $start = null;
            }
        }
        if ($start) {
            $runs[] = [$start, $to];
        }

        $stamp = now()->utc()->format('Ymd\THis\Z');
        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DineDesk//Room calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:'.self::text("{$tenant->name} – {$type->name}")];
        foreach ($runs as [$a, $b]) {
            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:'.$type->id.'-'.$a->format('Ymd').'@dinedesk';
            $lines[] = 'DTSTAMP:'.$stamp;
            $lines[] = 'DTSTART;VALUE=DATE:'.$a->format('Ymd');
            $lines[] = 'DTEND;VALUE=DATE:'.$b->format('Ymd');
            $lines[] = 'SUMMARY:Not available';
            $lines[] = 'END:VEVENT';
        }
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines)."\r\n";
    }

    /** Reads a site's calendar and replaces its blocks. Returns how many bookings it holds. */
    public function import(Tenant $tenant, RoomCalendarFeed $feed): int
    {
        try {
            $events = $this->parse($this->fetch($feed->url), $tenant->timezone);
        } catch (Throwable $e) {
            $feed->update(['error' => mb_substr($e instanceof ApiException ? $e->getMessage() : 'Could not read this calendar link.', 0, 200)]);
            throw $e instanceof ApiException ? $e : new ApiException('Could not read this calendar link. Check it in the booking site and try again.', 422, 'calendar_unreadable');
        }
        $today = CarbonImmutable::now($tenant->timezone)->format('Y-m-d');
        $events = array_values(array_filter($events, fn ($e) => $e['end'] > $today));

        DB::transaction(function () use ($feed, $events) {
            RoomBlock::where('room_calendar_feed_id', $feed->id)->delete();
            foreach ($events as $e) {
                RoomBlock::create([
                    'room_type_id' => $feed->room_type_id, 'room_calendar_feed_id' => $feed->id,
                    'uid' => $e['uid'] ? mb_substr($e['uid'], 0, 255) : null,
                    'starts_on' => $e['start'], 'ends_on' => $e['end'],
                    'summary' => $e['summary'] ? mb_substr($e['summary'], 0, 120) : null,
                ]);
            }
            $feed->update(['synced_at' => now(), 'error' => null, 'events' => count($events)]);
        });

        return count($events);
    }

    /**
     * Events from an .ics: all-day or timed, local dates; cancelled ones left out.
     *
     * @return list<array{uid: ?string, start: string, end: string, summary: ?string}>
     */
    public function parse(string $ics, string $timezone): array
    {
        if (! str_contains($ics, 'BEGIN:VCALENDAR')) {
            throw new ApiException('This link is not a calendar (.ics) file.', 422, 'not_a_calendar');
        }
        // Long lines continue on the next line after a space or tab.
        $lines = explode("\n", preg_replace("/\r?\n[ \t]/", '', str_replace("\r\n", "\n", $ics)));
        $events = [];
        $cur = null;
        foreach ($lines as $line) {
            $line = rtrim($line, "\r");
            if ($line === 'BEGIN:VEVENT') {
                $cur = [];

                continue;
            }
            if ($line === 'END:VEVENT') {
                if ($cur !== null && isset($cur['DTSTART']) && strtoupper($cur['STATUS'] ?? '') !== 'CANCELLED') {
                    $start = $this->date($cur['DTSTART'], $timezone);
                    $end = isset($cur['DTEND']) ? $this->date($cur['DTEND'], $timezone) : null;
                    if ($start) {
                        $end = $end && $end > $start ? $end : CarbonImmutable::parse($start)->addDay()->format('Y-m-d');
                        $events[] = ['uid' => $cur['UID'] ?? null, 'start' => $start, 'end' => $end, 'summary' => isset($cur['SUMMARY']) ? stripcslashes($cur['SUMMARY']) : null];
                    }
                }
                $cur = null;

                continue;
            }
            if ($cur !== null && preg_match('/^([A-Z-]+)((?:;[^:]*)?):(.*)$/', $line, $m)) {
                $cur[$m[1]] = $m[1] === 'DTSTART' || $m[1] === 'DTEND' ? $m[2].':'.$m[3] : $m[3];
            }
            if (count($events) > 5000) {
                break;
            }
        }

        return $events;
    }

    /** ";VALUE=DATE:20261012", ":20261012T140000Z", ";TZID=Asia/Kolkata:20261012T140000" → local date. */
    private function date(string $raw, string $timezone): ?string
    {
        [$params, $value] = explode(':', $raw, 2) + [1 => ''];
        if (preg_match('/^(\d{4})(\d{2})(\d{2})$/', $value, $m)) {
            return "{$m[1]}-{$m[2]}-{$m[3]}";
        }
        if (! preg_match('/^(\d{8}T\d{6})(Z?)$/', $value, $m)) {
            return null;
        }
        $tz = $m[2] === 'Z' ? 'UTC' : (preg_match('/TZID=([^;]+)/', $params, $t) ? $t[1] : $timezone);
        try {
            return CarbonImmutable::createFromFormat('Ymd\THis', $m[1], $tz)->setTimezone($timezone)->format('Y-m-d');
        } catch (Throwable) {
            return null;
        }
    }

    /** Fetches a calendar link from the public internet only (never this server or its network). */
    private function fetch(string $url): string
    {
        $this->assertPublic($url);
        $res = Http::timeout(15)->withOptions([
            'allow_redirects' => ['max' => 3, 'protocols' => ['http', 'https'], 'on_redirect' => fn (RequestInterface $r, $res, UriInterface $uri) => $this->assertPublic((string) $uri)],
            'stream' => false,
        ])->withHeaders(['Accept' => 'text/calendar, */*'])->get($url);
        if (! $res->successful()) {
            throw new ApiException("The booking site answered {$res->status()} for this calendar link.", 422, 'calendar_unreadable');
        }
        $body = $res->body();
        if (strlen($body) > self::MAX_BYTES) {
            throw new ApiException('This calendar is too large to read.', 422, 'calendar_too_large');
        }

        return $body;
    }

    public function assertPublic(string $url): void
    {
        $parts = parse_url($url);
        $host = $parts['host'] ?? '';
        if (! in_array($parts['scheme'] ?? '', ['http', 'https'], true) || $host === '') {
            throw new ApiException('Use the calendar link (http or https) from the booking site.', 422, 'calendar_bad_link');
        }
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
        if (! $ips) {
            throw new ApiException('This calendar link\'s address could not be found.', 422, 'calendar_bad_link');
        }
        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw new ApiException('Calendar links must be on the public internet.', 422, 'calendar_bad_link');
            }
        }
    }

    private static function text(string $s): string
    {
        return addcslashes(str_replace(["\r", "\n"], ' ', $s), ',;\\');
    }
}
