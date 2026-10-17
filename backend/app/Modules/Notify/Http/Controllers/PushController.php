<?php

namespace App\Modules\Notify\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Notify\Models\PushSubscription;
use App\Modules\Notify\Support\SendFcm;
use App\Modules\Notify\Support\SendWebPush;
use App\Modules\Notify\Support\StaffText;
use App\Modules\Notify\Support\WebPushChannel;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Turn push alerts on or off for this device, and send a test. */
class PushController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return $this->ok([
            'enabled' => WebPushChannel::ready(),
            'public_key' => config('dinedesk.webpush.public_key'),
            'devices' => PushSubscription::where('user_id', $request->user()->id)->count(),
        ]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        if (! WebPushChannel::ready()) {
            throw new ApiException('Push alerts are not set up on this server yet.', 422, 'push_off');
        }
        $data = $request->validate([
            'endpoint' => ['required', 'url:https', 'max:1000'],
            'keys.p256dh' => ['required', 'string', 'max:120'],
            'keys.auth' => ['required', 'string', 'max:60'],
        ]);
        $hash = hash('sha256', $data['endpoint']);
        // A device belongs to whoever signed in on it last.
        PushSubscription::withoutGlobalScopes()->where('endpoint_hash', $hash)->delete();
        PushSubscription::create([
            'user_id' => $request->user()->id,
            'endpoint' => $data['endpoint'],
            'endpoint_hash' => $hash,
            'p256dh' => $data['keys']['p256dh'],
            'auth' => $data['keys']['auth'],
            'device' => mb_substr((string) $request->userAgent(), 0, 120),
        ]);

        return $this->ok(['devices' => PushSubscription::where('user_id', $request->user()->id)->count()], 'Alerts are on for this device.');
    }

    public function unsubscribe(Request $request): JsonResponse
    {
        $endpoint = (string) $request->validate(['endpoint' => ['required', 'string', 'max:1000']])['endpoint'];
        PushSubscription::where('user_id', $request->user()->id)->where('endpoint_hash', hash('sha256', $endpoint))->delete();

        return $this->ok(null, 'Alerts are off for this device.');
    }

    public function test(Request $request): JsonResponse
    {
        $t = StaffText::for($request->user());
        $payload = ['title' => 'DineDesk', 'body' => $t('push_test'), 'url' => '/dashboard', 'tag' => 'test'];
        SendWebPush::dispatch($request->user()->id, $payload);
        // And the DineDesk app on this person's phones (nothing happens without Firebase or devices).
        SendFcm::dispatch($request->user()->id, $payload + ['kind' => 'test'], 'orders');

        return $this->ok(null, 'Test alert sent.');
    }
}
