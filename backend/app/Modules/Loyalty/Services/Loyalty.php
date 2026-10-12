<?php

namespace App\Modules\Loyalty\Services;

use App\Modules\Loyalty\Models\LoyaltyEntry;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Support\Money;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Messaging\Messenger;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

/**
 * Loyalty points: earned on what a guest pays for food (after discounts, before
 * packaging / delivery), redeemed as money off. Online, spending points needs a
 * one-time code sent to the guest's phone, so nobody can spend someone else's points.
 */
class Loyalty
{
    public const KEY = 'loyalty';

    public function __construct(
        private readonly TenantSettings $settings,
        private readonly Messenger $messenger,
    ) {}

    public static function defaults(): array
    {
        return [
            'enabled' => false,
            // Points for every ₹100 paid, and what one point is worth when spent.
            'earn_per_100' => 5,
            'point_value' => 1.0,
            'min_redeem' => 50,
            // At most this share of the bill can be paid with points.
            'max_redeem_percent' => 50,
        ];
    }

    public static function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'earn_per_100' => ['required', 'numeric', 'min:0', 'max:100'],
            'point_value' => ['required', 'numeric', 'min:0.01', 'max:100'],
            'min_redeem' => ['required', 'integer', 'min:0', 'max:100000'],
            'max_redeem_percent' => ['required', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function get(): array
    {
        return array_replace(self::defaults(), (array) $this->settings->get(self::KEY, []));
    }

    public function save(array $data): array
    {
        $clean = array_replace(self::defaults(), array_intersect_key($data, self::defaults()));
        $clean['enabled'] = (bool) $clean['enabled'];
        $clean['earn_per_100'] = round((float) $clean['earn_per_100'], 2);
        $clean['point_value'] = round((float) $clean['point_value'], 2);
        $clean['min_redeem'] = (int) $clean['min_redeem'];
        $clean['max_redeem_percent'] = (int) $clean['max_redeem_percent'];
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }

    /** Points earned for paying $paise for food. */
    public function pointsFor(int $paise): int
    {
        $s = $this->get();

        return $s['enabled'] ? (int) floor($paise / 10000 * $s['earn_per_100']) : 0;
    }

    /**
     * How many points can be spent on a bill of $billPaise (food after other discounts), and their value.
     *
     * @return array{points: int, paise: int}
     */
    public function redeemable(Customer $customer, int $requested, int $billPaise): array
    {
        $s = $this->get();
        if (! $s['enabled']) {
            throw new ApiException('Loyalty points are not available.', 422, 'loyalty_off');
        }
        if ($requested < $s['min_redeem']) {
            throw new ApiException("You can use points from {$s['min_redeem']} points.", 422, 'loyalty_min', ['field' => 'loyalty.points']);
        }
        if ($requested > $customer->loyalty_points) {
            throw new ApiException("You have {$customer->loyalty_points} points.", 422, 'loyalty_balance', ['field' => 'loyalty.points']);
        }
        $value = Money::toPaise($s['point_value']);
        $cap = (int) floor($billPaise * $s['max_redeem_percent'] / 100);
        $points = min($requested, $value > 0 ? intdiv($cap, $value) : 0);

        return ['points' => $points, 'paise' => $points * $value];
    }

    public function redeem(Customer $customer, int $points, ?int $orderId, ?int $invoiceId, ?int $userId = null): void
    {
        if ($points <= 0) {
            return;
        }
        $this->post($customer, 'redeem', -$points, $orderId, $invoiceId, 'Used on '.($orderId ? 'an order' : 'a bill'), $userId);
    }

    /** Points for a completed, paid order (once per order). */
    public function earn(Order $order): void
    {
        if (! $order->customer_id || $order->payment_status !== 'paid' || LoyaltyEntry::where('order_id', $order->id)->where('type', 'earn')->exists()) {
            return;
        }
        $food = Money::toPaise($order->total) - Money::toPaise($order->packaging_fee) - Money::toPaise($order->delivery_fee);
        $points = $this->pointsFor(max(0, $food));
        if ($points > 0) {
            $this->post(Customer::findOrFail($order->customer_id), 'earn', $points, $order->id, null, "Order #{$order->number}");
        }
    }

    /** Order cancelled: points spent on it come back, points earned on it go (once). */
    public function reverseOrder(Order $order): void
    {
        if (! $order->customer_id || LoyaltyEntry::where('order_id', $order->id)->where('type', 'reverse')->exists()) {
            return;
        }
        $net = (int) LoyaltyEntry::where('order_id', $order->id)->whereIn('type', ['earn', 'redeem'])->sum('points');
        if ($net !== 0) {
            $this->post(Customer::findOrFail($order->customer_id), 'reverse', -$net, $order->id, null, "Order #{$order->number} cancelled");
        }
    }

    /** Bill cancelled: points used on it come back. */
    public function reverseInvoice(int $invoiceId): void
    {
        $used = LoyaltyEntry::where('invoice_id', $invoiceId)->where('type', 'redeem')->get();
        foreach ($used as $e) {
            $this->post(Customer::findOrFail($e->customer_id), 'reverse', -$e->points, null, $invoiceId, 'Bill cancelled');
        }
    }

    public function adjust(Customer $customer, int $points, string $note, int $userId): void
    {
        $this->post($customer, 'adjust', $points, null, null, $note, $userId);
    }

    /** Sends a one-time code so a guest can use their points online. */
    public function sendCode(Tenant $tenant, string $phone): array
    {
        $key = "loyalty-otp:{$tenant->id}:{$phone}";
        if (Cache::has("{$key}:wait")) {
            throw new ApiException('Please wait a moment before asking for another code.', 429, 'otp_wait');
        }
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        Cache::put($key, ['hash' => Hash::make($code), 'tries' => 0], now()->addMinutes(10));
        Cache::put("{$key}:wait", true, now()->addSeconds(30));
        try {
            $this->messenger->send('sms', $phone, "{$code} is your code to use your {$tenant->name} points. It expires in 10 minutes.", $code);
        } catch (\Throwable $e) {
            Log::warning('Loyalty code not sent: '.$e->getMessage());
        }
        $out = ['sent' => true];
        if (config('dinedesk.otp.dev_echo') && app()->environment('local')) {
            $out['dev_code'] = $code;
        }

        return $out;
    }

    /**
     * Checks the code and returns a short-lived token for checkout, with the balance.
     *
     * @return array{token: string, points: int, value: string}
     */
    public function verify(Tenant $tenant, string $phone, string $code): array
    {
        $key = "loyalty-otp:{$tenant->id}:{$phone}";
        $row = Cache::get($key);
        if (! $row || $row['tries'] >= 5) {
            Cache::forget($key);
            throw new ApiException('That code has expired. Ask for a new one.', 422, 'otp_invalid', ['field' => 'code']);
        }
        if (! Hash::check($code, $row['hash'])) {
            Cache::put($key, ['hash' => $row['hash'], 'tries' => $row['tries'] + 1], now()->addMinutes(10));
            throw new ApiException('That code is incorrect.', 422, 'otp_invalid', ['field' => 'code']);
        }
        Cache::forget($key);
        $customer = Customer::where('phone', $phone)->first();

        return [
            'token' => Crypt::encryptString(json_encode(['t' => $tenant->id, 'p' => $phone, 'e' => now()->addMinutes(30)->timestamp])),
            'points' => (int) ($customer?->loyalty_points ?? 0),
            'value' => Money::toRupees((int) ($customer?->loyalty_points ?? 0) * Money::toPaise($this->get()['point_value'])),
        ];
    }

    /** The customer a checkout token belongs to (same business, not expired). */
    public function customerFromToken(Tenant $tenant, string $token): Customer
    {
        $data = rescue(fn () => json_decode(Crypt::decryptString($token), true), null, false);
        if (! $data || ($data['t'] ?? null) !== $tenant->id || ($data['e'] ?? 0) < now()->timestamp) {
            throw new ApiException('Please confirm your phone again to use points.', 422, 'loyalty_token', ['field' => 'loyalty.token']);
        }
        $customer = Customer::where('phone', $data['p'])->first();
        if (! $customer) {
            throw new ApiException('No points found for this number.', 422, 'loyalty_balance', ['field' => 'loyalty.points']);
        }

        return $customer;
    }

    private function post(Customer $customer, string $type, int $points, ?int $orderId, ?int $invoiceId, ?string $note, ?int $userId = null): void
    {
        DB::transaction(function () use ($customer, $type, $points, $orderId, $invoiceId, $note, $userId) {
            $c = Customer::whereKey($customer->id)->lockForUpdate()->first();
            $balance = $c->loyalty_points + $points;
            if ($balance < 0 && $type === 'redeem') {
                throw new ApiException("You have {$c->loyalty_points} points.", 422, 'loyalty_balance', ['field' => 'loyalty.points']);
            }
            $c->update(['loyalty_points' => $balance]);
            LoyaltyEntry::create([
                'customer_id' => $c->id, 'order_id' => $orderId, 'invoice_id' => $invoiceId, 'type' => $type, 'points' => $points,
                'balance_after' => $balance, 'note' => $note, 'user_id' => $userId, 'created_at' => now(),
            ]);
        });
    }
}
