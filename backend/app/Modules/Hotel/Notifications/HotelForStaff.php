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
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return $this->data;
    }
}
