<?php

namespace App\Modules\Hotel\Services;

use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBlock;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomCalendarFeed;
use App\Modules\Hotel\Models\RoomType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Rooms free per type and night. A type can be sold while, on every night of the stay,
 * its sellable rooms (active, not out of order) outnumber the bookings holding one.
 * Bookings are for a type; the exact room is assigned by the front desk.
 */
class RoomAvailability
{
    /** Bookings that take a room on some night between $in and $out (check-out day is free). */
    public static function overlapping(string $in, string $out, ?int $exceptId = null): Builder
    {
        return RoomBooking::query()
            ->whereIn('status', RoomBooking::HOLDING)
            ->where(fn ($q) => $q->whereNull('hold_expires_at')->orWhere('hold_expires_at', '>', now()))
            ->where('check_in', '<', $out)->where('check_out', '>', $in)
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId));
    }

    /**
     * Rooms held by bookings on other sites (their calendars), shaped like bookings: each holds
     * one room of its type on its nights.
     *
     * @return Collection<int, object>
     */
    public static function blocks(string $in, string $out): Collection
    {
        return RoomBlock::where('starts_on', '<', $out)->where('ends_on', '>', $in)->get()
            ->map(fn (RoomBlock $b) => (object) ['room_type_id' => $b->room_type_id, 'check_in' => $b->starts_on, 'check_out' => $b->ends_on])
            ->toBase();
    }

    public function sellableRooms(int $typeId): int
    {
        return Room::where('room_type_id', $typeId)->where('is_active', true)->where('housekeeping', '!=', 'out_of_order')->count();
    }

    /** Fewest rooms of the type free on any night of the stay. */
    public function freeRooms(RoomType $type, string $in, string $out, ?int $exceptId = null): int
    {
        $rooms = $this->sellableRooms($type->id);
        $bookings = self::overlapping($in, $out, $exceptId)->where('room_type_id', $type->id)->get(['check_in', 'check_out'])->toBase()
            ->concat(self::blocks($in, $out)->where('room_type_id', $type->id));

        return $rooms - $this->peak($bookings, $in, $out);
    }

    /** Whether one particular room has no other booking on those nights. */
    public function roomFree(Room $room, string $in, string $out, ?int $exceptId = null): ?RoomBooking
    {
        return self::overlapping($in, $out, $exceptId)->where('room_id', $room->id)->orderBy('check_in')->first();
    }

    /**
     * Every active type with how many rooms are free for the stay (website search and front desk).
     *
     * @return Collection<int, array{type: RoomType, free: int}>
     */
    public function search(string $in, string $out, ?int $exceptId = null): Collection
    {
        $types = RoomType::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();
        $rooms = Room::where('is_active', true)->where('housekeeping', '!=', 'out_of_order')
            ->selectRaw('room_type_id, COUNT(*) as n')->groupBy('room_type_id')->pluck('n', 'room_type_id');
        $bookings = self::overlapping($in, $out, $exceptId)->get(['room_type_id', 'check_in', 'check_out'])->toBase()
            ->concat(self::blocks($in, $out))->groupBy('room_type_id');

        return $types->map(fn (RoomType $t) => [
            'type' => $t,
            'free' => max(0, (int) ($rooms[$t->id] ?? 0) - $this->peak($bookings->get($t->id, collect()), $in, $out)),
        ]);
    }

    /**
     * The front desk calendar: each room by type, the bookings on it within the window,
     * and bookings not given a room yet.
     */
    public function calendar(string $from, int $days): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $from);
        $end = $start->addDays($days);
        $bookings = RoomBooking::whereIn('status', ['pending', 'confirmed', 'checked_in', 'checked_out'])
            ->where(fn ($q) => $q->whereNull('hold_expires_at')->orWhere('hold_expires_at', '>', now())->orWhere('status', '!=', 'pending'))
            ->where('check_in', '<', $end->format('Y-m-d'))->where('check_out', '>', $start->format('Y-m-d'))
            ->orderBy('check_in')->get();
        $present = fn (RoomBooking $b) => [
            'id' => $b->id, 'code' => $b->code, 'name' => $b->name, 'status' => $b->status,
            'check_in' => $b->check_in->format('Y-m-d'), 'check_out' => $b->check_out->format('Y-m-d'),
            'adults' => $b->adults, 'children' => $b->children, 'room_id' => $b->room_id,
        ];

        $types = RoomType::with(['rooms' => fn ($q) => $q->where('is_active', true)])->orderBy('sort_order')->orderBy('id')->get()
            ->filter(fn (RoomType $t) => $t->is_active || $t->rooms->isNotEmpty());
        $external = RoomBlock::where('starts_on', '<', $end->format('Y-m-d'))->where('ends_on', '>', $start->format('Y-m-d'))->orderBy('starts_on')->get();
        $feeds = RoomCalendarFeed::whereIn('id', $external->pluck('room_calendar_feed_id')->filter())->pluck('name', 'id');

        return [
            'from' => $start->format('Y-m-d'),
            'days' => $days,
            'types' => $types->map(fn (RoomType $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'rooms' => $t->rooms->map(fn (Room $r) => [
                    'id' => $r->id, 'number' => $r->number, 'housekeeping' => $r->housekeeping,
                    'bookings' => $bookings->where('room_id', $r->id)->values()->map($present),
                ])->values(),
                'unassigned' => $bookings->where('room_type_id', $t->id)->whereNull('room_id')->whereIn('status', ['pending', 'confirmed'])->values()->map($present),
                // Rooms held by bookings on other sites (calendar sync).
                'external' => $external->where('room_type_id', $t->id)->values()->map(fn (RoomBlock $b) => [
                    'id' => $b->id, 'source' => $feeds[$b->room_calendar_feed_id] ?? null, 'summary' => $b->summary,
                    'check_in' => $b->starts_on->format('Y-m-d'), 'check_out' => $b->ends_on->format('Y-m-d'),
                ]),
            ])->values(),
        ];
    }

    /** Most bookings on any one night between $in and $out. */
    private function peak(Collection $bookings, string $in, string $out): int
    {
        if ($bookings->isEmpty()) {
            return 0;
        }
        $peak = 0;
        $d = CarbonImmutable::createFromFormat('!Y-m-d', $in);
        $last = CarbonImmutable::createFromFormat('!Y-m-d', $out);
        for (; $d->lt($last); $d = $d->addDay()) {
            $night = $d->format('Y-m-d');
            $n = $bookings->filter(fn ($b) => $b->check_in->format('Y-m-d') <= $night && $b->check_out->format('Y-m-d') > $night)->count();
            $peak = max($peak, $n);
        }

        return $peak;
    }
}
