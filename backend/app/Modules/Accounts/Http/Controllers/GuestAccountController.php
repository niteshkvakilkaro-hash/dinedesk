<?php

namespace App\Modules\Accounts\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Accounts\Models\GuestSession;
use App\Modules\Accounts\Services\GuestAccounts;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Guest sign-in on a business website (tenant from the host; token in X-Guest-Token). */
class GuestAccountController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly GuestAccounts $accounts) {}

    public function code(Request $request): JsonResponse
    {
        return $this->ok($this->accounts->sendCode($this->context->require(), $this->phone($request)), 'Code sent.');
    }

    public function verify(Request $request): JsonResponse
    {
        $phone = $this->phone($request);
        $code = (string) $request->validate(['code' => ['required', 'digits:6']])['code'];
        $result = $this->accounts->verify($this->context->require(), $phone, $code);

        return $this->ok(['token' => $result['token'], 'account' => $this->accounts->present($result['account'])], 'Signed in.');
    }

    public function show(Request $request): JsonResponse
    {
        return $this->ok($this->accounts->present($this->session($request)->account));
    }

    public function update(Request $request): JsonResponse
    {
        $account = $this->session($request)->account;
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'addresses' => ['present', 'array', 'max:'.GuestAccounts::MAX_ADDRESSES],
            'addresses.*.label' => ['nullable', 'string', 'max:30'],
            'addresses.*.line1' => ['required', 'string', 'min:3', 'max:200'],
            'addresses.*.line2' => ['nullable', 'string', 'max:200'],
            'addresses.*.landmark' => ['nullable', 'string', 'max:120'],
            'addresses.*.pincode' => ['required', 'regex:/^[1-9][0-9]{5}$/'],
        ]);
        $clean = fn ($v) => $v === null || trim((string) $v) === '' ? null : trim(strip_tags((string) $v));
        $account->update([
            'name' => $clean($data['name'] ?? null),
            'addresses' => array_values(array_map(fn ($a) => [
                'label' => $clean($a['label'] ?? null),
                'line1' => $clean($a['line1']),
                'line2' => $clean($a['line2'] ?? null),
                'landmark' => $clean($a['landmark'] ?? null),
                'pincode' => $a['pincode'],
            ], $data['addresses'])),
        ]);

        return $this->ok($this->accounts->present($account->fresh()), 'Saved.');
    }

    public function signOut(Request $request): JsonResponse
    {
        $this->session($request)->delete();

        return $this->ok(null, 'Signed out.');
    }

    private function phone(Request $request): string
    {
        $phone = Phone::normalize((string) $request->validate(['phone' => ['required', 'string', 'max:20']])['phone']);
        if (! preg_match('/^\+91[6-9]\d{9}$/', (string) $phone)) {
            throw new ApiException(Phone::MESSAGE, 422, 'invalid_phone', ['field' => 'phone']);
        }

        return $phone;
    }

    private function session(Request $request): GuestSession
    {
        $session = $this->accounts->fromToken($request->header('X-Guest-Token'));
        if (! $session) {
            throw new ApiException('Please sign in again.', 401, 'guest_signed_out');
        }

        return $session;
    }
}
