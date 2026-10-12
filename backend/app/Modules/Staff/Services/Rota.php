<?php

namespace App\Modules\Staff\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Staff\Models\Attendance;
use App\Modules\Staff\Models\Shift;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The weekly rota and attendance. Staff clock themselves in and out from their own login;
 * managers plan shifts, and add or correct entries (marked as such). Late = first clock-in of
 * the day more than GRACE minutes after the day's earliest shift start.
 */
class Rota
{
    public const GRACE = 10;

    /** A clock-in left open this long is treated as a forgotten clock-out. */
    private const STALE_HOURS = 16;

    public function today(Tenant $tenant): CarbonImmutable
    {
        return CarbonImmutable::now($tenant->timezone)->startOfDay();
    }

    /** Active team members (owner included), by name. */
    public function team(Tenant $tenant): Collection
    {
        return User::where('tenant_id', $tenant->id)->where('status', 'active')->with('roles')->orderBy('name')->get();
    }

    public function open(User $user): ?Attendance
    {
        return Attendance::where('user_id', $user->id)->whereNull('clock_out')->latest('clock_in')->first();
    }

    /** Clocks the person in, or out if they are in. */
    public function clock(Tenant $tenant, User $user): Attendance
    {
        return DB::transaction(function () use ($tenant, $user) {
            $open = Attendance::where('user_id', $user->id)->whereNull('clock_out')->lockForUpdate()->latest('clock_in')->first();
            if ($open && $open->clock_in->lt(now()->subHours(self::STALE_HOURS))) {
                // Forgot to clock out: close it with no time counted, for a manager to correct.
                $open->update(['clock_out' => $open->clock_in, 'note' => 'Missed clock-out']);
                $open = null;
            }
            if ($open) {
                $open->update(['clock_out' => now()]);

                return $open->fresh();
            }

            return Attendance::create(['user_id' => $user->id, 'date' => $this->today($tenant)->format('Y-m-d'), 'clock_in' => now(), 'source' => 'self']);
        });
    }

    /** The signed-in person's own card: clocked in or not, today's shifts and time worked. */
    public function me(Tenant $tenant, User $user): array
    {
        $today = $this->today($tenant)->format('Y-m-d');
        $entries = Attendance::where('user_id', $user->id)->where('date', $today)->get();

        return [
            'open' => $this->open($user)?->present(),
            'minutes_today' => $entries->sum(fn (Attendance $a) => $a->minutes()),
            'shifts' => Shift::where('user_id', $user->id)->whereBetween('date', [$today, $this->today($tenant)->addDays(6)->format('Y-m-d')])
                ->orderBy('date')->orderBy('starts')->get()->map(fn (Shift $s) => $s->present())->values(),
        ];
    }

    public function week(Tenant $tenant, CarbonImmutable $start): array
    {
        $start = $start->startOfWeek(CarbonImmutable::MONDAY);
        $end = $start->addDays(6);
        $days = collect(range(0, 6))->map(fn ($i) => $start->addDays($i)->format('Y-m-d'));
        $worked = Attendance::whereBetween('date', [$start->format('Y-m-d'), $end->format('Y-m-d')])->get()
            ->groupBy(fn (Attendance $a) => $a->user_id.'|'.$a->date->format('Y-m-d'))
            ->map(fn (Collection $g) => ['minutes' => $g->sum(fn (Attendance $a) => $a->minutes()), 'open' => $g->contains(fn (Attendance $a) => ! $a->clock_out)]);

        return [
            'start' => $start->format('Y-m-d'),
            'days' => $days->values(),
            'staff' => $this->people($tenant),
            'shifts' => Shift::whereBetween('date', [$start->format('Y-m-d'), $end->format('Y-m-d')])->orderBy('starts')->get()->map(fn (Shift $s) => $s->present())->values(),
            'worked' => $worked,
        ];
    }

    /** Copies last week's rota into an empty week. */
    public function copyWeek(Tenant $tenant, CarbonImmutable $start): int
    {
        $start = $start->startOfWeek(CarbonImmutable::MONDAY);
        $range = [$start->format('Y-m-d'), $start->addDays(6)->format('Y-m-d')];
        if (Shift::whereBetween('date', $range)->exists()) {
            throw new ApiException('This week already has shifts. Clear them first to copy last week.', 422, 'not_empty');
        }
        $teamIds = $this->team($tenant)->pluck('id');
        $last = Shift::whereBetween('date', [$start->subWeek()->format('Y-m-d'), $start->subDay()->format('Y-m-d')])->whereIn('user_id', $teamIds)->get();
        foreach ($last as $s) {
            Shift::create(['user_id' => $s->user_id, 'date' => $s->date->addWeek()->format('Y-m-d'), 'starts' => $s->starts, 'ends' => $s->ends, 'note' => $s->note]);
        }

        return $last->count();
    }

    public function report(Tenant $tenant, string $from, string $to): array
    {
        $tz = $tenant->timezone;
        $today = $this->today($tenant)->format('Y-m-d');
        $shifts = Shift::whereBetween('date', [$from, $to])->get()->groupBy('user_id');
        $entries = Attendance::whereBetween('date', [$from, $to])->orderBy('clock_in')->get();
        $byUser = $entries->groupBy('user_id');

        $rows = $this->team($tenant)->map(function (User $u) use ($shifts, $byUser, $today, $tz) {
            $mine = $shifts->get($u->id, collect());
            $starts = $mine->groupBy(fn (Shift $s) => $s->date->format('Y-m-d'))->map(fn (Collection $g) => $g->min('starts'));
            $worked = $byUser->get($u->id, collect())->groupBy(fn (Attendance $a) => $a->date->format('Y-m-d'));
            $late = $worked->filter(function (Collection $g, string $day) use ($starts, $tz) {
                if (! isset($starts[$day])) {
                    return false;
                }
                $due = CarbonImmutable::parse("{$day} {$starts[$day]}", $tz)->addMinutes(self::GRACE);

                return $g->min('clock_in')->gt($due);
            })->count();

            return [
                'user_id' => $u->id,
                'name' => $u->name,
                'role' => $u->roles->first()?->name,
                'scheduled' => $starts->count(),
                'present' => $worked->count(),
                'absent' => $starts->keys()->filter(fn ($d) => $d < $today && ! $worked->has($d))->count(),
                'late' => $late,
                'minutes' => $worked->flatten()->sum(fn (Attendance $a) => $a->minutes()),
            ];
        })->values();

        return [
            'from' => $from,
            'to' => $to,
            'grace' => self::GRACE,
            'rows' => $rows,
            'entries' => $entries->sortByDesc('clock_in')->take(300)->map(fn (Attendance $a) => $a->present())->values(),
        ];
    }

    /** A manager adds or corrects an entry (local times). */
    public function saveEntry(Tenant $tenant, ?Attendance $entry, int $userId, string $date, string $in, ?string $out, ?string $note): Attendance
    {
        $tz = $tenant->timezone;
        $clockIn = CarbonImmutable::parse("{$date} {$in}", $tz);
        $clockOut = $out ? CarbonImmutable::parse("{$date} {$out}", $tz) : null;
        if ($clockOut && $clockOut->lte($clockIn)) {
            $clockOut = $clockOut->addDay(); // past midnight
        }
        if ($clockIn->isFuture() || $clockOut?->isFuture()) {
            throw new ApiException('Times can not be in the future.', 422, 'future');
        }
        $attrs = ['user_id' => $userId, 'date' => $date, 'clock_in' => $clockIn->utc(), 'clock_out' => $clockOut?->utc(), 'source' => 'manager', 'note' => $note ? strip_tags($note) : null];
        $entry ? $entry->update($attrs) : $entry = Attendance::create($attrs);
        AuditLog::record('attendance.saved', $entry, ['user_id' => $userId, 'date' => $date, 'in' => $in, 'out' => $out]);

        return $entry;
    }

    private function people(Tenant $tenant): Collection
    {
        return $this->team($tenant)->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name, 'role' => $u->roles->first()?->name])->values();
    }
}
