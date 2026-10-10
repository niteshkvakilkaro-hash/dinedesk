<?php

namespace App\Modules\Reservations\Services;

use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Models\ReservationSlot;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Which booking times are free for a party on a date:
 *  - each slot has a capacity in guests (bookings starting in that slot count against it)
 *  - when the business has tables (and table matching on), a free table big enough
 *    must exist for the whole stay; the smallest one that fits is held for the booking
 *  - blackout dates, holiday closures, the booking window and lead time apply
 */
class Availability
{
    public function __construct(
        private readonly ReservationSettings $settings,
        private readonly TenantSettings $tenantSettings,
    ) {}

    /**
     * Slot templates for one weekday. Once a business has set up any slots, only those
     * count (a day without slots takes no bookings); before that they come from opening hours.
     *
     * @return list<array{time: string, capacity: int}>
     */
    public function slotsFor(string $day, ?array $s = null): array
    {
        $s ??= $this->settings->get();
        if (ReservationSlot::exists()) {
            return ReservationSlot::where('day', $day)->where('is_active', true)->orderBy('time')->get()
                ->map(fn (ReservationSlot $r) => ['time' => $r->time, 'capacity' => $r->capacity])->all();
        }
        $hours = (array) $this->tenantSettings->get('opening_hours', []);

        return self::generate($hours[$day] ?? null, $s['slot_minutes'], $s['duration_minutes'], $s['default_capacity']);
    }

    /**
     * Start times from opening to (closing − stay), every $step minutes, same calendar day only.
     *
     * @return list<array{time: string, capacity: int}>
     */
    public static function generate(?array $dayHours, int $step, int $duration, int $capacity): array
    {
        if (! $dayHours || ! empty($dayHours['closed']) || empty($dayHours['open']) || empty($dayHours['close'])) {
            return [];
        }
        $m = fn (string $t) => ((int) substr($t, 0, 2)) * 60 + (int) substr($t, 3, 2);
        $open = $m($dayHours['open']);
        $close = $m($dayHours['close']);
        if ($close <= $open) {
            $close += 1440; // open past midnight
        }
        $out = [];
        for ($t = $open; $t + $duration <= $close && $t < 1440; $t += $step) {
            $out[] = ['time' => sprintf('%02d:%02d', intdiv($t, 60), $t % 60), 'capacity' => $capacity];
        }

        return $out;
    }

    /** Why a date can't be booked at all, or null. */
    public function dateProblem(Tenant $tenant, string $date, ?array $s = null): ?array
    {
        $s ??= $this->settings->get();
        $tz = $tenant->timezone;
        $today = CarbonImmutable::now($tz)->format('Y-m-d');
        $last = CarbonImmutable::now($tz)->addDays($s['max_days'])->format('Y-m-d');
        if ($date < $today) {
            return ['code' => 'past', 'message' => 'That date has passed.'];
        }
        if ($date > $last) {
            return ['code' => 'too_far', 'message' => "You can book up to {$s['max_days']} days ahead."];
        }
        foreach ($s['blackout_dates'] as $b) {
            if ($b['date'] === $date) {
                return ['code' => 'blackout', 'message' => $b['label'] ? "We are not taking bookings on this day ({$b['label']})." : 'We are not taking bookings on this day.'];
            }
        }
        foreach ((array) $this->tenantSettings->get('holidays', []) as $h) {
            if (($h['date'] ?? null) === $date) {
                return ['code' => 'holiday', 'message' => 'We are closed on this day.'];
            }
        }

        return null;
    }

    /**
     * Every slot on a date for a party of $party.
     *
     * @return array{date: string, problem: ?array, slots: list<array{time: string, available: bool, reason: ?string, capacity: int, booked: int, table_id: ?int, starts_at: string}>}
     */
    public function forDate(Tenant $tenant, string $date, int $party, ?int $ignoreReservationId = null, ?array $s = null): array
    {
        $s ??= $this->settings->get();
        if ($problem = $this->dateProblem($tenant, $date, $s)) {
            return ['date' => $date, 'problem' => $problem, 'slots' => []];
        }
        $tz = $tenant->timezone;
        $day = strtolower(CarbonImmutable::createFromFormat('Y-m-d', $date, $tz)->format('D'));
        $templates = $this->slotsFor($day, $s);
        $dayStart = CarbonImmutable::createFromFormat('Y-m-d H:i', "{$date} 00:00", $tz)->utc();

        $holding = Reservation::whereIn('status', Reservation::HOLDING)
            ->when($ignoreReservationId, fn ($q) => $q->whereKeyNot($ignoreReservationId))
            ->where('starts_at', '<', $dayStart->addDays(2))
            ->where('ends_at', '>', $dayStart->subDay())
            ->get(['id', 'date', 'time', 'party_size', 'starts_at', 'ends_at', 'dining_table_id']);
        $tables = $s['match_tables'] ? DiningTable::where('is_active', true)->orderBy('seats')->orderBy('sort_order')->orderBy('id')->get(['id', 'seats']) : collect();
        $earliest = CarbonImmutable::now()->addMinutes($s['lead_minutes']);

        $slots = [];
        foreach ($templates as $tpl) {
            $start = CarbonImmutable::createFromFormat('Y-m-d H:i', "{$date} {$tpl['time']}", $tz)->utc();
            $end = $start->addMinutes($s['duration_minutes']);
            $booked = (int) $holding->filter(fn ($r) => $r->date->format('Y-m-d') === $date && $r->time === $tpl['time'])->sum('party_size');
            $table = $tables->isNotEmpty() ? $this->pickTable($tables, $holding, $party, $start, $end) : null;

            $reason = match (true) {
                $start->lt($earliest) => 'too_soon',
                $booked + $party > $tpl['capacity'] => 'full',
                $tables->isNotEmpty() && ! $table => 'no_table',
                default => null,
            };
            $slots[] = [
                'time' => $tpl['time'],
                'available' => $reason === null,
                'reason' => $reason,
                'capacity' => $tpl['capacity'],
                'booked' => $booked,
                'table_id' => $table,
                'starts_at' => $start->toIso8601String(),
            ];
        }

        return ['date' => $date, 'problem' => null, 'slots' => $slots];
    }

    /** Smallest active table that seats the party and is free for the whole stay. */
    public function pickTable(Collection $tables, Collection $holding, int $party, CarbonImmutable $start, CarbonImmutable $end): ?int
    {
        foreach ($tables as $t) {
            if ($t->seats < $party) {
                continue;
            }
            $clash = $holding->contains(fn ($r) => $r->dining_table_id === $t->id && $r->starts_at->lt($end) && $r->ends_at->gt($start));
            if (! $clash) {
                return $t->id;
            }
        }

        return null;
    }

    public static function reasonMessage(?string $reason, int $party): string
    {
        return match ($reason) {
            'too_soon' => 'That time is too soon to book online. Please pick a later time or call us.',
            'full' => 'That time is fully booked. Please pick another time.',
            'no_table' => "We don't have a free table for {$party} at that time. Please pick another time.",
            default => 'That time is not available.',
        };
    }
}
