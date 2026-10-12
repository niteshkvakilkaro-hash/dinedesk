<?php

namespace App\Modules\Accounts\Services;

use App\Modules\Accounts\Models\GuestAccount;
use App\Modules\Accounts\Models\GuestSession;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Messaging\Messenger;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Sign-in for guests on a business website: phone + 6-digit SMS code, then a long-lived
 * token for that browser. Nothing is created in the CRM; orders are matched by phone.
 */
class GuestAccounts
{
    public const SESSION_DAYS = 90;

    public const MAX_ADDRESSES = 5;

    public function __construct(private readonly Messenger $messenger) {}

    /** @return array{sent: bool, dev_code?: string} */
    public function sendCode(Tenant $tenant, string $phone): array
    {
        $key = "guest-otp:{$tenant->id}:{$phone}";
        if (Cache::has("{$key}:wait")) {
            throw new ApiException('Please wait a moment before asking for another code.', 429, 'otp_wait');
        }
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        Cache::put($key, ['hash' => Hash::make($code), 'tries' => 0], now()->addMinutes(10));
        Cache::put("{$key}:wait", true, now()->addSeconds(30));
        try {
            $this->messenger->send('sms', $phone, "{$code} is your code to sign in to {$tenant->name}. It expires in 10 minutes.", $code);
        } catch (\Throwable $e) {
            Log::warning('Guest sign-in code not sent: '.$e->getMessage());
        }
        $out = ['sent' => true];
        if (config('dinedesk.otp.dev_echo') && app()->environment('local')) {
            $out['dev_code'] = $code;
        }

        return $out;
    }

    /** @return array{token: string, account: GuestAccount} */
    public function verify(Tenant $tenant, string $phone, string $code): array
    {
        $key = "guest-otp:{$tenant->id}:{$phone}";
        $row = Cache::get($key);
        if (! $row || $row['tries'] >= 5) {
            Cache::forget($key);
            throw new ApiException('This code has expired. Ask for a new one.', 422, 'otp_expired');
        }
        if (! Hash::check($code, $row['hash'])) {
            Cache::put($key, ['hash' => $row['hash'], 'tries' => $row['tries'] + 1], now()->addMinutes(10));
            throw new ApiException('That code is not right. Check the SMS and try again.', 422, 'otp_wrong');
        }
        Cache::forget($key);

        $account = GuestAccount::firstOrCreate(['phone' => $phone]);
        if (! $account->name) {
            // Start with the name from their latest order, if they have ordered before.
            $name = Order::where('customer_phone', $phone)->latest('id')->value('customer_name');
            if ($name) {
                $account->update(['name' => $name]);
            }
        }
        $token = Str::random(48);
        GuestSession::create(['guest_account_id' => $account->id, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addDays(self::SESSION_DAYS)]);

        return ['token' => $token, 'account' => $account];
    }

    public function fromToken(?string $token): ?GuestSession
    {
        if (! $token || strlen($token) > 100) {
            return null;
        }
        $session = GuestSession::with('account')->where('token_hash', hash('sha256', $token))->first();
        if (! $session || $session->expires_at->isPast()) {
            return null;
        }
        if (! $session->last_used_at || $session->last_used_at->lt(now()->subHour())) {
            $session->update(['last_used_at' => now()]);
        }

        return $session;
    }

    /** What the guest sees about themselves: details, points and their recent orders on any device. */
    public function present(GuestAccount $account): array
    {
        $customer = Customer::where('phone', $account->phone)->first();
        $orders = Order::where('customer_phone', $account->phone)
            ->where(fn ($w) => $w->where('payment_method', '!=', 'online')->orWhere('payment_status', 'paid'))
            ->latest('id')->limit(20)->get(['public_id', 'tracking_token', 'number', 'placed_at']);

        return [
            'phone' => $account->phone,
            'name' => $account->name,
            'addresses' => $account->addresses ?? [],
            'points' => (int) ($customer?->loyalty_points ?? 0),
            // The guest proved this phone, so they may open their own orders' tracking pages.
            'orders' => $orders->map(fn ($o) => ['id' => $o->public_id, 'token' => $o->tracking_token, 'number' => $o->number, 'at' => $o->placed_at->toIso8601String()])->values(),
        ];
    }
}
