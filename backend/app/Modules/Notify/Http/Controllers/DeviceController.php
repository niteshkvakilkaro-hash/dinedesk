<?php

namespace App\Modules\Notify\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Notify\Models\PushDevice;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Phones with the DineDesk Android app: the web app inside the app registers the phone's Firebase
 * token after sign-in (and when Firebase gives it a new one), and removes it on sign-out. Anyone
 * signed in (owner, staff, rider, super admin), never from a support session.
 */
class DeviceController extends Controller
{
    private const TOKEN = '/^[A-Za-z0-9_:.\-]{20,512}$/';

    public function store(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'token' => ['required', 'string', 'regex:'.self::TOKEN],
            'app_version' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9._ -]+$/'],
            'flavor' => ['nullable', 'string', 'in:dev,prod'],
        ], ['token.regex' => 'That is not an app notification token.']);
        $access = $user->currentAccessToken();

        // A phone belongs to whoever signed in on it last.
        PushDevice::updateOrCreate(['token' => $data['token']], [
            'user_id' => $user->id,
            'tenant_id' => $user->tenant_id,
            'platform' => 'android',
            'app_flavor' => $data['flavor'] ?? null,
            'app_version' => $data['app_version'] ?? null,
            'locale' => $user->locale,
            'access_token_id' => $access instanceof PersonalAccessToken ? $access->id : null,
            'last_seen_at' => now(),
        ]);

        return $this->ok(['devices' => PushDevice::where('user_id', $user->id)->count()], 'App notifications are on for this phone.');
    }

    public function destroy(Request $request, string $token): JsonResponse
    {
        $user = $this->user($request);
        PushDevice::where('user_id', $user->id)->where('token', $token)->delete();

        return $this->ok(null, 'App notifications are off for this phone.');
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        // Dashboard people only (a guest's sign-in on a business website is another kind of token).
        abort_unless($user instanceof User, 403);
        if ($user->supportSession()) {
            throw new ApiException('A support session can’t register this phone for notifications.', 403, 'support_session');
        }

        return $user;
    }
}
