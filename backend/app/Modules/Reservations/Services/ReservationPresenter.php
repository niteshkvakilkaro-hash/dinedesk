<?php

namespace App\Modules\Reservations\Services;

use App\Modules\Reservations\Models\Reservation;

class ReservationPresenter
{
    /** What the guest sees when they look up their booking (they already know their own details). */
    public function forGuest(Reservation $r): array
    {
        return [
            'code' => $r->code,
            'name' => $r->name,
            'party_size' => $r->party_size,
            'date' => $r->date->format('Y-m-d'),
            'time' => $r->time,
            'starts_at' => $r->starts_at->toIso8601String(),
            'status' => $r->status,
            'notes' => $r->notes,
            'cancellable' => in_array($r->status, ['pending', 'confirmed'], true) && now()->lt($r->starts_at),
        ];
    }

    public function forStaff(Reservation $r): array
    {
        return $this->forGuest($r) + [
            'id' => $r->id,
            'phone' => $r->phone,
            'email' => $r->email,
            'ends_at' => $r->ends_at->toIso8601String(),
            'source' => $r->source,
            'staff_note' => $r->staff_note,
            'cancelled_by' => $r->cancelled_by,
            'table' => $r->table ? ['id' => $r->table->id, 'label' => $r->table->label, 'seats' => $r->table->seats] : null,
            'created_at' => $r->created_at->toIso8601String(),
            'decided_at' => $r->decided_at?->toIso8601String(),
            'reminder_sent_at' => $r->reminder_sent_at?->toIso8601String(),
            'next' => array_values(array_filter(
                Bookings::TRANSITIONS[$r->status] ?? [],
                fn ($s) => $s !== 'no_show' || now()->gte($r->starts_at),
            )),
        ];
    }
}
