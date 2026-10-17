<?php

namespace App\Modules\Notify\Support;

use App\Modules\Notify\Models\PushDevice;
use App\Support\Push\Fcm;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/** Sends one notification to every DineDesk app (Android) of one person; drops devices whose token is gone. */
class SendFcm implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;

    /** @param  array{title: string, body: string, url?: string, kind?: string, tag?: string}  $payload */
    public function __construct(public readonly int $userId, public readonly array $payload, public readonly string $channel = 'general') {}

    /** @return array{sent: int, removed: int, failed: int} */
    public function handle(Fcm $fcm): array
    {
        $result = ['sent' => 0, 'removed' => 0, 'failed' => 0];
        if (! Fcm::configured()) {
            return $result;
        }
        foreach (PushDevice::where('user_id', $this->userId)->get() as $device) {
            $status = $fcm->send($device->token, $this->payload, $this->channel);
            if ($status === Fcm::INVALID) {
                $device->delete();
                $result['removed']++;
            } else {
                $result[$status === Fcm::SENT ? 'sent' : 'failed']++;
            }
        }

        return $result;
    }
}
