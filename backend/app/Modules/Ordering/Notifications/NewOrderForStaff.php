<?php

namespace App\Modules\Ordering\Notifications;

use App\Modules\Notify\Support\StaffText;
use App\Modules\Ordering\Models\Order;
use Illuminate\Notifications\Notification;

/** In-app alert for staff who can see orders (the dashboard polls and plays a sound). */
class NewOrderForStaff extends Notification
{
    public function __construct(public readonly Order $order) {}

    public function via(object $notifiable): array
    {
        return ['database', 'webpush'];
    }

    /** Push alert on staff phones (see Notify module), in the recipient's language. */
    public function toWebPush(object $notifiable): array
    {
        $o = $this->order;
        $t = StaffText::for($notifiable);
        $body = array_filter([
            $o->customer_name,
            $t("order.types.{$o->type}"),
            $o->scheduled_for ? $t('order.for', ['when' => $t->date($o->scheduled_for, 'D MMM, h:mm A', 'Asia/Kolkata')]) : null,
        ]);

        return ['title' => $t('order.title', ['number' => $o->number, 'total' => $o->total]), 'body' => implode(' · ', $body), 'url' => '/dashboard/orders', 'tag' => "order-{$o->id}"];
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
