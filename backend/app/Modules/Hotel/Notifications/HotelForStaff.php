<?php

namespace App\Modules\Hotel\Notifications;

use Illuminate\Notifications\Notification;

/** In-app alert for the front desk: a new room booking or a banquet enquiry from the website. */
class HotelForStaff extends Notification
{
    /** @param  array<string, mixed>  $data */
    public function __construct(public readonly array $data) {}

    public function via(object $notifiable): array
    {
        return ['database', 'webpush'];
    }

    public function toWebPush(object $notifiable): array
    {
        $d = $this->data;

        return ($d['kind'] ?? '') === 'banquet'
            ? ['title' => 'Event enquiry · '.($d['name'] ?? ''), 'body' => trim(ucfirst((string) ($d['event_type'] ?? '')).' '.($d['event_date'] ?? '')), 'url' => '/dashboard/hotel', 'tag' => 'banquet-'.($d['enquiry_id'] ?? '')]
            : ['title' => 'Room booking · '.($d['name'] ?? ''), 'body' => ($d['check_in'] ?? '').' → '.($d['check_out'] ?? '').' · #'.($d['code'] ?? ''), 'url' => '/dashboard/hotel', 'tag' => 'stay-'.($d['booking_id'] ?? '')];
    }

    public function toArray(object $notifiable): array
    {
        return $this->data;
    }
}
