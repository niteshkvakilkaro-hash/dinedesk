<?php

namespace App\Modules\Notify\Support;

use App\Modules\Notify\Models\PushSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/** Sends one alert to every device of one staff member; drops devices that unsubscribed. */
class SendWebPush implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;

    /** @param  array{title: string, body: string, url: string, tag?: string}  $payload */
    public function __construct(public readonly int $userId, public readonly array $payload) {}

    public function handle(): void
    {
        // Runs in a queue worker without a tenant in context: the user id is the boundary.
        $subs = PushSubscription::withoutGlobalScopes()->where('user_id', $this->userId)->get();
        if ($subs->isEmpty() || ! WebPushChannel::ready()) {
            return;
        }
        $push = new WebPush(['VAPID' => [
            'subject' => config('dinedesk.webpush.subject'),
            'publicKey' => config('dinedesk.webpush.public_key'),
            'privateKey' => config('dinedesk.webpush.private_key'),
        ]], ['TTL' => 600, 'urgency' => 'high']);
        $body = json_encode($this->payload);
        foreach ($subs as $s) {
            $push->queueNotification(Subscription::create(['endpoint' => $s->endpoint, 'keys' => ['p256dh' => $s->p256dh, 'auth' => $s->auth]]), $body);
        }
        foreach ($push->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                PushSubscription::withoutGlobalScopes()->where('endpoint_hash', hash('sha256', $report->getEndpoint()))->delete();
            } elseif (! $report->isSuccess()) {
                Log::warning('Web push failed: '.$report->getReason());
            }
        }
    }
}
