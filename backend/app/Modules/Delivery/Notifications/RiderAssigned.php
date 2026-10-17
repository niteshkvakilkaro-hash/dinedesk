<?php

namespace App\Modules\Delivery\Notifications;

use App\Modules\Notify\Support\FcmChannel;
use App\Modules\Notify\Support\StaffText;
use App\Modules\Ordering\Models\Order;
use Illuminate\Notifications\Notification;

/** Push alert on the rider's phone: a delivery order was given to them (in their own language). */
class RiderAssigned extends Notification
{
    public function __construct(public readonly Order $order) {}

    public function via(object $notifiable): array
    {
        return ['webpush', ...FcmChannel::for($notifiable)];
    }

    /** The same alert in the DineDesk Android app; rings (channel "orders"). */
    public function toFcm(object $notifiable): array
    {
        return $this->toWebPush($notifiable) + ['kind' => 'rider', 'channel' => 'orders'];
    }

    public function toWebPush(object $notifiable): array
    {
        $o = $this->order;
        $t = StaffText::for($notifiable);
        $a = (array) $o->address;
        $place = implode(', ', array_filter([$a['line1'] ?? null, $a['pincode'] ?? null]));
        $body = array_filter([
            $o->customer_name,
            $place ?: null,
            $o->payment_method === 'cod' && $o->payment_status !== 'paid' ? $t('rider.collect', ['amount' => $o->total]) : null,
        ]);

        return ['title' => $t('rider.title', ['number' => $o->number]), 'body' => implode(' · ', $body), 'url' => '/rider/', 'tag' => "rider-order-{$o->id}"];
    }
}
