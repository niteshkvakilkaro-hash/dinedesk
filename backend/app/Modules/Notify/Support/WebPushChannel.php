<?php

namespace App\Modules\Notify\Support;

use App\Models\User;
use Illuminate\Notifications\Notification;

/**
 * Notification channel "webpush": staff alerts (new order, booking ...) also go to the phones
 * where that person turned push on. Sending happens in a queued job so placing an order never
 * waits for the push services.
 */
class WebPushChannel
{
    public static function ready(): bool
    {
        return filled(config('dinedesk.webpush.public_key')) && filled(config('dinedesk.webpush.private_key'));
    }

    public function send(object $notifiable, Notification $notification): void
    {
        if (! self::ready() || ! $notifiable instanceof User || ! method_exists($notification, 'toWebPush')) {
            return;
        }
        SendWebPush::dispatch($notifiable->id, $notification->toWebPush($notifiable))->afterCommit();
    }
}
