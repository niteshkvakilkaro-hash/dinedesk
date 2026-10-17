<?php

namespace App\Modules\Notify\Support;

use App\Models\User;
use App\Modules\Notify\Models\PushDevice;
use App\Support\Push\Fcm;
use Illuminate\Notifications\Notification;

/**
 * Notification channel "fcm": the same staff alerts as "webpush" (new order, booking ...), on
 * phones with the DineDesk Android app (web push doesn't work inside the app's WebView). Texts
 * come from the notification's toFcm() (or toWebPush()), already in the recipient's language;
 * sending happens in a queued job.
 */
class FcmChannel
{
    /** ['fcm'] for via() when Firebase is set up and the person has the app signed in somewhere. */
    public static function for(object $notifiable): array
    {
        return $notifiable instanceof User && Fcm::configured() && PushDevice::where('user_id', $notifiable->id)->exists() ? ['fcm'] : [];
    }

    public function send(object $notifiable, Notification $notification): void
    {
        if (! $notifiable instanceof User || ! Fcm::configured()) {
            return;
        }
        $payload = match (true) {
            method_exists($notification, 'toFcm') => $notification->toFcm($notifiable),
            method_exists($notification, 'toWebPush') => $notification->toWebPush($notifiable),
            default => null,
        };
        if (! $payload) {
            return;
        }
        SendFcm::dispatch($notifiable->id, $payload, $payload['channel'] ?? 'general')->afterCommit();
    }
}
