<?php

namespace App\Modules\Hotel\Services;

use App\Models\User;
use App\Modules\Hotel\Models\HousekeepingLog;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Support\ApiException;
use App\Support\Realtime\Live;
use Carbon\CarbonImmutable;

/**
 * Room state for housekeeping: clean → (guest stays / leaves) → dirty → clean → inspected,
 * or out of order (not sold until fixed). Every change is logged with who made it.
 */
class Housekeeping
{
    public function set(Room $room, string $to, ?string $note, ?User $by): Room
    {
        if (! in_array($to, Room::HOUSEKEEPING, true)) {
            throw new ApiException('Unknown room status.', 422, 'invalid_status');
        }
        if ($to === 'out_of_order' && ! trim((string) $note)) {
            throw new ApiException('Say what is wrong with the room.', 422, 'reason_required', ['field' => 'note']);
        }
        if ($to === 'out_of_order' && RoomBooking::where('room_id', $room->id)->where('status', 'checked_in')->exists()) {
            throw new ApiException("A guest is staying in room {$room->number}. Move them first.", 422, 'room_occupied');
        }
        $from = $room->housekeeping;
        $room->update(['housekeeping' => $to, 'housekeeping_note' => $note ? strip_tags($note) : null, 'housekeeping_at' => now()]);
        HousekeepingLog::create(['room_id' => $room->id, 'from' => $from, 'to' => $to, 'note' => $note ? mb_substr(strip_tags($note), 0, 200) : null, 'user_id' => $by?->id, 'created_at' => now()]);
        Live::emit($room->tenant_id, 'hotel', 'room.changed', ['id' => $room->id, 'housekeeping' => $to]);

        return $room;
    }

    /** Every room with its state and who is in it / arriving today (housekeeping board). */
    public function board(string $timezone): array
    {
        $today = CarbonImmutable::now($timezone)->format('Y-m-d');
        $rooms = Room::with('type')->where('is_active', true)->orderBy('sort_order')->orderBy('number')->get();
        $stays = RoomBooking::whereIn('status', ['checked_in', 'confirmed'])->whereNotNull('room_id')
            ->where('check_in', '<=', $today)->where('check_out', '>=', $today)->get()->groupBy('room_id');

        return $rooms->map(function (Room $r) use ($stays, $today) {
            $here = $stays->get($r->id, collect());
            $in = $here->firstWhere('status', 'checked_in');

            return [
                'id' => $r->id,
                'number' => $r->number,
                'floor' => $r->floor,
                'type' => $r->type->name,
                'housekeeping' => $r->housekeeping,
                'note' => $r->housekeeping_note,
                'changed_at' => $r->housekeeping_at?->toIso8601String(),
                'occupied' => (bool) $in,
                'departing' => $in && $in->check_out->format('Y-m-d') === $today,
                'arriving' => $here->contains(fn ($b) => $b->status === 'confirmed' && $b->check_in->format('Y-m-d') === $today),
            ];
        })->values()->all();
    }
}
