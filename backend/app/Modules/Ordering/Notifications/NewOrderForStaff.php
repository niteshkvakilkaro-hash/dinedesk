<?php

namespace App\Modules\Ordering\Notifications;

use App\Modules\Ordering\Models\Order;
use Illuminate\Notifications\Notification;

/** In-app alert for staff who can see orders (the dashboard polls and plays a sound). */
class NewOrderForStaff extends Notification
{
    public function __construct(public readonly Order $order) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'tenant_id' => $this->order->tenant_id,
            'order_id' => $this->order->id,
            'number' => $this->order->number,
            'type' => $this->order->type,
            'total' => $this->order->total,
            'customer_name' => $this->order->customer_name,
            'scheduled_for' => $this->order->scheduled_for?->toIso8601String(),
        ];
    }
}
