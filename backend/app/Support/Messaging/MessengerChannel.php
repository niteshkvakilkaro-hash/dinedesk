<?php

namespace App\Support\Messaging;

use Illuminate\Notifications\Notification;

/** Laravel notification channel for the "whatsapp" and "sms" routes. */
class MessengerChannel
{
    public function __construct(private readonly Messenger $messenger, private readonly string $channel) {}

    public function send(object $notifiable, Notification $notification): void
    {
        $to = $notifiable->routeNotificationFor($this->channel, $notification);
        if (! $to || ! method_exists($notification, 'toText')) {
            return;
        }
        $this->messenger->send($this->channel, $to, $notification->toText());
    }
}
