<?php

namespace App\Modules\Ordering\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Notifications\CustomerNotifier;
use App\Modules\Ordering\Notifications\NewOrderForStaff;
use App\Modules\Ordering\Support\Money;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Phone;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * Placing orders and moving them through their life:
 * pending → confirmed → preparing → ready → (out_for_delivery) → completed, or cancelled.
 */
class OrderFlow
{
    /** Allowed next statuses (staff). Delivery orders go out for delivery; others are collected / served. */
    public const TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['preparing', 'cancelled'],
        'preparing' => ['ready', 'cancelled'],
        'ready' => ['out_for_delivery', 'completed', 'cancelled'],
        'out_for_delivery' => ['completed'],
        'completed' => [],
        'cancelled' => [],
    ];

    /** Unpaid online orders are released after this many minutes. */
    public const PAYMENT_WINDOW_MINUTES = 30;

    public function __construct(
        private readonly OrderingSettings $ordering,
        private readonly TenantSettings $settings,
        private readonly Pricing $pricing,
        private readonly DeliveryZones $zones,
        private readonly Razorpay $razorpay,
        private readonly CustomerNotifier $notifier,
    ) {}

    /**
     * @return array{order: Order, razorpay: ?array}
     */
    public function place(Tenant $tenant, array $data, string $locale = 'en'): array
    {
        $s = $this->ordering->get();
        $type = $data['type'];

        if (! $s['accepting_orders']) {
            throw new ApiException('Online ordering is paused right now. Please call the restaurant.', 422, 'not_accepting');
        }
        if (empty($s['types'][$type])) {
            throw new ApiException('That order type is not available.', 422, 'type_unavailable', ['field' => 'type']);
        }
        if (! in_array($data['payment_method'], $this->ordering->methodsFor($type, $s), true)) {
            throw new ApiException('That payment method is not available for this order.', 422, 'payment_method_unavailable', ['field' => 'payment_method']);
        }

        $scheduled = $this->checkTiming($tenant, $s, $data['scheduled_for'] ?? null);

        $zone = null;
        if ($type === 'delivery') {
            $zone = $this->zones->resolve($data['address']['pincode'] ?? null, $data['address']['lat'] ?? null, $data['address']['lng'] ?? null);
        }
        $quote = $this->pricing->quote($type, $data['items'], $zone);

        $phone = Phone::normalize($data['customer']['phone']);

        $order = DB::transaction(function () use ($tenant, $data, $type, $scheduled, $zone, $quote, $phone, $locale) {
            $customer = Customer::firstOrNew(['phone' => $phone]);
            $customer->fill([
                'name' => strip_tags($data['customer']['name']),
                'email' => $data['customer']['email'] ?? $customer->email,
                'orders_count' => $customer->orders_count + 1,
                'last_order_at' => now(),
            ])->save();

            // Per-business order numbers, #1001 upwards (row lock keeps them unique under load).
            $last = Order::lockForUpdate()->max('number');

            $order = Order::create([
                'tracking_token' => Str::random(40),
                'number' => max(1000, (int) $last) + 1,
                'customer_id' => $customer->id,
                'type' => $type,
                'status' => 'pending',
                'scheduled_for' => $scheduled,
                'customer_name' => strip_tags($data['customer']['name']),
                'customer_phone' => $phone,
                'customer_email' => $data['customer']['email'] ?? null,
                'address' => $type === 'delivery' ? $this->cleanAddress($data['address']) : null,
                'delivery_zone_id' => $zone?->id,
                'table_label' => $type === 'dine_in' && ! empty($data['table_label']) ? strip_tags($data['table_label']) : null,
                'notes' => isset($data['notes']) ? strip_tags($data['notes']) : null,
                'subtotal' => $quote['subtotal'],
                'tax_total' => $quote['tax_total'],
                'delivery_fee' => $quote['delivery_fee'],
                'packaging_fee' => $quote['packaging_fee'],
                'discount_total' => '0.00',
                'total' => $quote['total'],
                'prices_include_tax' => $quote['prices_include_tax'],
                'payment_method' => $data['payment_method'],
                'payment_status' => $data['payment_method'] === 'online' ? 'pending' : 'unpaid',
                'locale' => $locale === 'hi' ? 'hi' : 'en',
                'placed_at' => now(),
            ]);

            foreach ($quote['lines'] as $line) {
                $order->items()->create(['tenant_id' => $order->tenant_id] + array_merge($line, [
                    'addons' => array_map(fn ($a) => ['name' => $a['name'], 'price' => $a['price']], $line['addons']) ?: null,
                ]));
            }
            $this->event($order, 'pending', null, null);

            return $order;
        });

        $razorpay = null;
        if ($order->payment_method === 'online') {
            $rzp = $this->razorpay->createOrder(Money::toPaise($order->total), 'order-'.$order->number, ['order' => $order->public_id]);
            Payment::create([
                'order_id' => $order->id,
                'provider_order_id' => $rzp['id'],
                'amount' => $order->total,
                'currency' => 'INR',
                'status' => 'created',
            ]);
            $razorpay = [
                'key_id' => $this->razorpay->keyId(),
                'order_id' => $rzp['id'],
                'amount' => $rzp['amount'],
                'currency' => 'INR',
                'name' => $tenant->name,
                'description' => "Order #{$order->number}",
                'prefill' => ['name' => $order->customer_name, 'contact' => $order->customer_phone, 'email' => $order->customer_email],
            ];
        } else {
            // Pay-later orders go to the kitchen straight away; online ones once paid.
            $this->announce($order);
        }

        return ['order' => $order->fresh('items'), 'razorpay' => $razorpay];
    }

    /** Payment captured (checkout callback or webhook). Safe to call twice. */
    public function markPaid(Payment $payment, string $providerPaymentId, ?string $method = null): void
    {
        $announce = false;
        DB::transaction(function () use ($payment, $providerPaymentId, $method, &$announce) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($payment->status === 'captured') {
                return;
            }
            $payment->update(['status' => 'captured', 'provider_payment_id' => $providerPaymentId, 'method' => $method, 'error' => null]);
            $order = Order::whereKey($payment->order_id)->lockForUpdate()->firstOrFail();
            if ($order->status === 'cancelled') {
                // Paid after we released it: keep it cancelled, flag the refund for the owner.
                $order->update(['payment_status' => 'refund_due']);
                $this->event($order, 'payment', 'Payment received after cancellation — refund due', null);

                return;
            }
            $order->update(['payment_status' => 'paid']);
            $this->event($order, 'payment', 'Paid online', null);
            $announce = true;
        });
        if ($announce) {
            $this->announce($payment->order()->first());
        }
    }

    public function markPaymentFailed(Payment $payment, ?string $error): void
    {
        if ($payment->status === 'captured') {
            return;
        }
        $payment->update(['status' => 'failed', 'error' => $error ? Str::limit($error, 250) : null]);
        $order = $payment->order;
        if ($order->payment_status === 'pending') {
            $order->update(['payment_status' => 'failed']);
        }
    }

    /** Staff moves an order on. */
    public function transition(Order $order, string $to, ?User $by, ?string $note = null): Order
    {
        $allowed = self::TRANSITIONS[$order->status] ?? [];
        if ($to === 'out_for_delivery' && $order->type !== 'delivery') {
            $allowed = [];
        }
        if (! in_array($to, $allowed, true)) {
            throw new ApiException("An order that is {$this->label($order->status)} can't be marked {$this->label($to)}.", 422, 'invalid_transition');
        }
        if ($order->payment_method === 'online' && $order->payment_status !== 'paid' && $to !== 'cancelled') {
            throw new ApiException('This order has not been paid yet.', 422, 'awaiting_payment');
        }
        if ($to === 'cancelled' && ! $note) {
            throw new ApiException('Please give a reason for cancelling.', 422, 'reason_required', ['field' => 'note']);
        }

        DB::transaction(function () use ($order, $to, $by, $note) {
            $changes = ['status' => $to];
            if ($to === 'cancelled') {
                $changes['cancel_reason'] = strip_tags($note);
                if ($order->payment_status === 'paid') {
                    $changes['payment_status'] = 'refund_due';
                }
            }
            if ($to === 'completed' && in_array($order->payment_method, ['cod', 'counter'], true)) {
                $changes['payment_status'] = 'paid';
            }
            $order->update($changes);
            $this->event($order, $to, $note ? strip_tags($note) : null, $by?->id);
            if ($to === 'cancelled') {
                AuditLog::record('order.cancelled', $order, ['number' => $order->number, 'reason' => $note, 'payment_status' => $order->payment_status]);
            }
        });

        $this->notifier->statusChanged($order->fresh());

        return $order->fresh(['items', 'events']);
    }

    /** Releases online orders whose payment never completed. */
    public function expireUnpaid(): int
    {
        $count = 0;
        Order::where('payment_method', 'online')
            ->whereIn('payment_status', ['pending', 'failed'])
            ->where('status', 'pending')
            ->where('placed_at', '<', now()->subMinutes(self::PAYMENT_WINDOW_MINUTES))
            ->each(function (Order $order) use (&$count) {
                $order->update(['status' => 'cancelled', 'cancel_reason' => 'Payment not completed']);
                $this->event($order, 'cancelled', 'Payment not completed', null);
                $count++;
            });

        return $count;
    }

    private function announce(Order $order): void
    {
        $staff = User::where('tenant_id', $order->tenant_id)->where('status', 'active')->get()
            ->filter(fn (User $u) => in_array('orders.view', $u->tenantPermissions(), true));
        Notification::send($staff, new NewOrderForStaff($order));
        $this->notifier->placed($order);
    }

    private function event(Order $order, string $status, ?string $note, ?int $userId): void
    {
        OrderEvent::create(['order_id' => $order->id, 'status' => $status, 'note' => $note, 'user_id' => $userId, 'created_at' => now()]);
    }

    /** Ordering now needs the business open; ordering for later needs an open slot within the window. */
    private function checkTiming(Tenant $tenant, array $s, ?string $scheduledFor): ?CarbonImmutable
    {
        $hours = $this->settings->get('opening_hours');
        $holidays = (array) $this->settings->get('holidays', []);
        $tz = $tenant->timezone;

        if (! $scheduledFor) {
            if ($hours && ! OpeningHours::status($hours, $tz, null, $holidays)['is_open']) {
                throw new ApiException('We are closed right now. You can schedule your order for later.', 422, 'closed_now', ['field' => 'scheduled_for']);
            }

            return null;
        }

        if (! $s['scheduling']['enabled']) {
            throw new ApiException('Scheduled orders are not available.', 422, 'scheduling_disabled', ['field' => 'scheduled_for']);
        }
        $at = CarbonImmutable::parse($scheduledFor)->utc();
        if ($at->lt(now()->addMinutes((int) $s['prep_minutes'] - 1))) {
            throw new ApiException("Please choose a time at least {$s['prep_minutes']} minutes from now.", 422, 'too_soon', ['field' => 'scheduled_for']);
        }
        $latest = CarbonImmutable::now($tz)->addDays((int) $s['scheduling']['max_days'])->endOfDay();
        if ($at->gt($latest)) {
            throw new ApiException("You can order up to {$s['scheduling']['max_days']} days ahead.", 422, 'too_far', ['field' => 'scheduled_for']);
        }
        if ($hours && ! OpeningHours::status($hours, $tz, $at, $holidays)['is_open']) {
            throw new ApiException('We are closed at that time. Please pick a time within opening hours.', 422, 'closed_then', ['field' => 'scheduled_for']);
        }

        return $at;
    }

    private function cleanAddress(array $a): array
    {
        $t = fn ($v) => $v === null || $v === '' ? null : strip_tags((string) $v);

        return [
            'line1' => $t($a['line1'] ?? null),
            'line2' => $t($a['line2'] ?? null),
            'landmark' => $t($a['landmark'] ?? null),
            'pincode' => $t($a['pincode'] ?? null),
            'lat' => isset($a['lat']) ? (float) $a['lat'] : null,
            'lng' => isset($a['lng']) ? (float) $a['lng'] : null,
        ];
    }

    private function label(string $status): string
    {
        return str_replace('_', ' ', $status);
    }
}
