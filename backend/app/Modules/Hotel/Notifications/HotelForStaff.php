<?php

namespace App\Modules\Hotel\Notifications;

use App\Modules\Notify\Support\StaffText;
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
        $t = StaffText::for($notifiable);
        $date = fn (?string $day) => $day ? $t->date($day) : '';

        if (($d['kind'] ?? '') === 'banquet') {
            $type = $t('hotel.event_types.'.($d['event_type'] ?? 'other'));
            $body = empty($d['event_date']) ? $type : $t('hotel.event_body', ['type' => $type, 'date' => $date($d['event_date'])]);

            return ['title' => $t('hotel.event_title', ['name' => $d['name'] ?? '']), 'body' => $body, 'url' => '/dashboard/hotel', 'tag' => 'banquet-'.($d['enquiry_id'] ?? '')];
        }

        return [
            'title' => $t('hotel.room_title', ['name' => $d['name'] ?? '']),
            'body' => $t('hotel.room_body', ['check_in' => $date($d['check_in'] ?? null), 'check_out' => $date($d['check_out'] ?? null), 'code' => $d['code'] ?? '']),
            'url' => '/dashboard/hotel',
            'tag' => 'stay-'.($d['booking_id'] ?? ''),
        ];
    }

    public function toArray(object $notifiable): array
    {
        return $this->data;
    }
}
