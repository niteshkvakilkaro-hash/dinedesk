<?php

namespace App\Modules\Reservations\Notifications;

use App\Modules\Reservations\Models\Reservation;
use Illuminate\Notifications\Notification;

/** In-app alert for staff who manage reservations (the dashboard polls and plays a sound). */
class NewReservationForStaff extends Notification
{
    public function __construct(public readonly Reservation $reservation) {}

    public function via(object $notifiable): array
    {
        return ['database', 'webpush'];
    }

    public function toWebPush(object $notifiable): array
    {
        $r = $this->reservation;

        return ['title' => "Table booking · {$r->name}", 'body' => "{$r->party_size} guests · ".$r->date->format('j M')." at {$r->time} · #{$r->code}", 'url' => '/dashboard/reservations', 'tag' => "reservation-{$r->id}"];
    }

    public function toArray(object $notifiable): array
    {
        $r = $this->reservation;

        return [
            'tenant_id' => $r->tenant_id,
            'kind' => 'reservation',
            'reservation_id' => $r->id,
            'code' => $r->code,
            'name' => $r->name,
            'party_size' => $r->party_size,
            'date' => $r->date->format('Y-m-d'),
            'time' => $r->time,
            'status' => $r->status,
        ];
    }
}
