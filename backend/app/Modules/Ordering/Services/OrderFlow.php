<?php

namespace App\Modules\Ordering\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Crm\Services\CustomerActivity;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Services\Folio;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Kitchen\Services\Kitchen;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Marketing\Models\Coupon;
use App\Modules\Marketing\Services\Coupons;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Notifications\CustomerNotifier;
use App\Modules\Ordering\Notifications\NewOrderForStaff;
use App\Modules\Ordering\Support\Money;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Services\DineIn;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Locale;
use App\Support\Phone;
use App\Support\Realtime\Live;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
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
        private readonly DineIn $dineIn,
        private readonly FeatureService $features,
        private readonly Kitchen $kitchen,
    ) {}

    /**
     * @return array{order: Order, razorpay: ?array}
     */
    public function place(Tenant $tenant, array $data, string $locale = 'en'): array
    {
        if ($data['type'] === 'room_service') {
            return $this->placeForRoom($tenant, $data, $locale);
        }
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

        // Ordering from a table's QR code: the order joins that table's running bill.
        $table = null;
        if ($type === 'dine_in' && ! empty($data['table_token'])) {
            if (! $this->features->enabled($tenant, 'qr_ordering')) {
                throw new ApiException('Ordering from the table is not available. Please ask the staff.', 422, 'qr_unavailable');
            }
            $table = $this->dineIn->resolve($data['table_token']);
            $data['scheduled_for'] = null;
        }

        $scheduled = $this->checkTiming($tenant, $s, $data['scheduled_for'] ?? null);

        $zone = null;
        if ($type === 'delivery') {
            $zone = $this->zones->resolve($data['address']['pincode'] ?? null, $data['address']['lat'] ?? null, $data['address']['lng'] ?? null);
        }
        $quote = $this->pricing->quote($type, $data['items'], $zone);

        // Diners at a table may skip their phone number.
        $phone = ! empty($data['customer']['phone']) ? Phone::normalize($data['customer']['phone']) : null;
        [$quote, $offers] = $this->discounts($tenant, $quote, $data, $phone);

        $order = DB::transaction(function () use ($data, $type, $scheduled, $zone, $quote, $phone, $locale, $table, $offers) {
            $customer = null;
            if ($phone) {
                $customer = Customer::firstOrNew(['phone' => $phone]);
                $customer->fill([
                    'name' => strip_tags($data['customer']['name']),
                    'email' => $data['customer']['email'] ?? $customer->email,
                    'orders_count' => $customer->orders_count + 1,
                    'last_order_at' => now(),
                ])->save();
                // Offers by message only with a clear yes (never pre-ticked).
                if (! empty($data['marketing_opt_in']) && ! $customer->marketing_opt_in) {
                    $customer->update(['marketing_opt_in' => true, 'marketing_opt_in_at' => now(), 'unsubscribe_token' => $customer->unsubscribe_token ?? Str::random(40)]);
                }
            }
            $session = $table ? $this->dineIn->sessionFor($table) : null;

            // Per-business order numbers, #1001 upwards (row lock keeps them unique under load).
            $last = Order::lockForUpdate()->max('number');

            $order = Order::create([
                'tracking_token' => Str::random(40),
                'number' => max(1000, (int) $last) + 1,
                'customer_id' => $customer?->id,
                'type' => $type,
                'status' => 'pending',
                'scheduled_for' => $scheduled,
                'customer_name' => strip_tags($data['customer']['name']),
                'customer_phone' => $phone,
                'customer_email' => $data['customer']['email'] ?? null,
                'address' => $type === 'delivery' ? $this->cleanAddress($data['address']) : null,
                'delivery_zone_id' => $zone?->id,
                'table_label' => $table ? $table->label : ($type === 'dine_in' && ! empty($data['table_label']) ? strip_tags($data['table_label']) : null),
                'dining_table_id' => $table?->id,
                'table_session_id' => $session?->id,
                'notes' => isset($data['notes']) ? strip_tags($data['notes']) : null,
                'subtotal' => $quote['subtotal'],
                'tax_total' => $quote['tax_total'],
                'delivery_fee' => $quote['delivery_fee'],
                'packaging_fee' => $quote['packaging_fee'],
                'discount_total' => $quote['discount_total'] ?? '0.00',
                'discount_label' => $quote['discount_label'] ?? null,
                'marketing_opt_in' => ! empty($data['marketing_opt_in']),
                'total' => $quote['total'],
                'prices_include_tax' => $quote['prices_include_tax'],
                'payment_method' => $data['payment_method'],
                'payment_status' => $data['payment_method'] === 'online' ? 'pending' : 'unpaid',
                'source' => $table ? 'qr' : 'website',
                'locale' => Locale::guest($locale),
                'placed_at' => now(),
            ]);

            foreach ($quote['lines'] as $line) {
                $order->items()->create(['tenant_id' => $order->tenant_id] + array_merge($line, [
                    'addons' => array_map(fn ($a) => ['name' => $a['name'], 'price' => $a['price']], $line['addons']) ?: null,
                ]));
            }
            $this->event($order, 'pending', null, null);
            if ($offers['coupon']) {
                $this->coupons()->redeem($offers['coupon'], $offers['coupon_off'], $order->id, null, $customer?->id);
            }
            if ($offers['points'] > 0) {
                $this->loyalty()->redeem($offers['loyalty_customer'], $offers['points'], $order->id, null);
            }

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

    /**
     * Room service from a room's QR code (hotel). Only the guest staying in the room can
     * order to it: they confirm the last 4 digits of the mobile number the stay is booked
     * under. The order is charged to the room's folio and paid at check-out.
     *
     * @return array{order: Order, razorpay: null}
     */
    private function placeForRoom(Tenant $tenant, array $data, string $locale): array
    {
        $hotel = app(HotelSettings::class)->get();
        if (! $this->features->enabled($tenant, 'hotel') || ! $hotel['room_service']) {
            throw new ApiException('Ordering from the room is not available. Please call reception.', 422, 'room_service_off');
        }
        if (! $this->ordering->get()['accepting_orders']) {
            throw new ApiException('The kitchen is not taking orders right now. Please call reception.', 422, 'not_accepting');
        }
        if (($data['payment_method'] ?? null) !== 'room') {
            throw new ApiException('Room service is charged to your room.', 422, 'payment_method_unavailable', ['field' => 'payment_method']);
        }
        $room = Room::where('qr_token', (string) ($data['room_token'] ?? ''))->where('is_active', true)->first();
        if (! $room) {
            throw new ApiException('This room QR code is not active. Please call reception.', 404, 'room_not_found');
        }
        $stay = RoomBooking::where('room_id', $room->id)->where('status', 'checked_in')->first();
        if (! $stay) {
            throw new ApiException('Ordering to the room opens once you have checked in. Please call reception.', 422, 'no_guest');
        }
        // A few tries per room, so the 4 digits can't be guessed.
        $key = "room-pin|{$tenant->id}|{$room->id}";
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw new ApiException('Too many tries. Please call reception.', 429, 'too_many_attempts');
        }
        if (! hash_equals(substr($stay->phone, -4), (string) ($data['room_pin'] ?? ''))) {
            RateLimiter::hit($key, 15 * 60);
            throw new ApiException('That doesn\'t match the mobile number this room is booked under.', 422, 'room_verify', ['field' => 'room_pin']);
        }
        RateLimiter::clear($key);

        $quote = $this->pricing->quote('room_service', $data['items']);
        $order = DB::transaction(function () use ($data, $quote, $locale, $room, $stay) {
            $last = Order::lockForUpdate()->max('number');
            $order = Order::create([
                'tracking_token' => Str::random(40),
                'number' => max(1000, (int) $last) + 1,
                'customer_id' => $stay->customer_id,
                'type' => 'room_service',
                'status' => 'pending',
                'customer_name' => $stay->name,
                'customer_phone' => $stay->phone,
                'customer_email' => $stay->email,
                'table_label' => "Room {$room->number}",
                'room_booking_id' => $stay->id,
                'notes' => isset($data['notes']) ? strip_tags($data['notes']) : null,
                'subtotal' => $quote['subtotal'],
                'tax_total' => $quote['tax_total'],
                'delivery_fee' => $quote['delivery_fee'],
                'packaging_fee' => $quote['packaging_fee'],
                'total' => $quote['total'],
                'prices_include_tax' => $quote['prices_include_tax'],
                'payment_method' => 'room',
                'payment_status' => 'unpaid',
                'source' => 'room',
                'locale' => Locale::guest($locale),
                'placed_at' => now(),
            ]);
            foreach ($quote['lines'] as $line) {
                $order->items()->create(['tenant_id' => $order->tenant_id] + array_merge($line, [
                    'addons' => array_map(fn ($a) => ['name' => $a['name'], 'price' => $a['price']], $line['addons']) ?: null,
                ]));
            }
            $this->event($order, 'pending', null, null);
            app(Folio::class)->chargeOrder($order);

            return $order;
        });
        $this->announce($order);
        Live::emit($order->tenant_id, 'hotel', 'stay.changed', ['id' => $stay->id, 'status' => $stay->status]);

        return ['order' => $order->fresh('items'), 'razorpay' => null];
    }

    /**
     * An order entered by staff at the POS or on the waiter app: already accepted, so it is
     * confirmed and goes to the kitchen straight away. Not limited by the website's ordering
     * switch or opening hours (staff decide); pay at the counter / table.
     */
    public function placeByStaff(Tenant $tenant, array $data, User $by, string $source): Order
    {
        $type = $data['type'];
        $table = null;
        if ($type === 'dine_in' && ! empty($data['dining_table_id'])) {
            $table = DiningTable::where('is_active', true)->findOrFail($data['dining_table_id']);
        }
        $quote = $this->pricing->quote($type, $data['items']);
        $phone = ! empty($data['customer']['phone']) ? Phone::normalize($data['customer']['phone']) : null;
        $name = trim(strip_tags((string) ($data['customer']['name'] ?? ''))) ?: ($table ? "Table {$table->label}" : 'Walk-in');

        $order = DB::transaction(function () use ($data, $type, $quote, $phone, $name, $table, $by, $source) {
            $customer = null;
            if ($phone) {
                $customer = Customer::firstOrNew(['phone' => $phone]);
                $customer->fill(['name' => $name, 'orders_count' => $customer->orders_count + 1, 'last_order_at' => now()])->save();
            }
            $session = $table ? $this->dineIn->sessionFor($table) : null;
            $last = Order::lockForUpdate()->max('number');
            $order = Order::create([
                'tracking_token' => Str::random(40),
                'number' => max(1000, (int) $last) + 1,
                'customer_id' => $customer?->id,
                'type' => $type,
                'source' => $source,
                'created_by' => $by->id,
                'status' => 'confirmed',
                'customer_name' => $name,
                'customer_phone' => $phone,
                'table_label' => $table?->label,
                'dining_table_id' => $table?->id,
                'table_session_id' => $session?->id,
                'notes' => isset($data['notes']) && $data['notes'] !== '' ? strip_tags($data['notes']) : null,
                'subtotal' => $quote['subtotal'],
                'tax_total' => $quote['tax_total'],
                'delivery_fee' => '0.00',
                'packaging_fee' => $quote['packaging_fee'],
                'discount_total' => '0.00',
                'total' => $quote['total'],
                'prices_include_tax' => $quote['prices_include_tax'],
                'payment_method' => 'counter',
                'payment_status' => 'unpaid',
                'locale' => 'en',
                'placed_at' => now(),
            ]);
            foreach ($quote['lines'] as $line) {
                $order->items()->create(['tenant_id' => $order->tenant_id] + array_merge($line, [
                    'addons' => array_map(fn ($a) => ['name' => $a['name'], 'price' => $a['price']], $line['addons']) ?: null,
                ]));
            }
            $this->event($order, 'confirmed', ucfirst($source).' order', $by->id);

            return $order;
        });

        $this->kitchen->createFor($order);
        $this->emitOrder($order, 'order.created');

        return $order->fresh('items');
    }

    /**
     * Coupon and loyalty points for an online order: checked, worked out on the food before
     * GST and taken off the quote. Points need the checkout token from the phone code.
     *
     * @return array{0: array, 1: array{coupon: ?Coupon, coupon_off: int, loyalty_customer: ?Customer, points: int}}
     */
    public function discounts(Tenant $tenant, array $quote, array $data, ?string $phone): array
    {
        $items = Money::toPaise($quote['subtotal']);
        $coupon = null;
        $couponOff = 0;
        $labels = [];
        if (! empty($data['coupon_code'])) {
            if (! $this->features->enabled($tenant, 'coupons')) {
                throw new ApiException('Coupons are not available.', 422, 'coupon_invalid', ['field' => 'coupon_code']);
            }
            $coupon = $this->coupons()->find($data['coupon_code'], 'online');
            $customerId = $phone ? Customer::where('phone', $phone)->value('id') : null;
            $couponOff = $this->coupons()->discount($coupon, $items, $customerId);
            $labels[] = "Coupon {$coupon->code}";
        }
        $loyaltyCustomer = null;
        $points = 0;
        $pointsOff = 0;
        if (! empty($data['loyalty']['token']) && ! empty($data['loyalty']['points'])) {
            if (! $this->features->enabled($tenant, 'loyalty')) {
                throw new ApiException('Loyalty points are not available.', 422, 'loyalty_off');
            }
            $loyaltyCustomer = $this->loyalty()->customerFromToken($tenant, $data['loyalty']['token']);
            if ($phone && $loyaltyCustomer->phone !== $phone) {
                throw new ApiException('Use the same mobile number you confirmed for your points.', 422, 'loyalty_phone', ['field' => 'customer.phone']);
            }
            $r = $this->loyalty()->redeemable($loyaltyCustomer, (int) $data['loyalty']['points'], $items - $couponOff);
            [$points, $pointsOff] = [$r['points'], $r['paise']];
            if ($points > 0) {
                $labels[] = "{$points} points";
            }
        }
        $quote = $this->pricing->applyDiscount($quote, $couponOff + $pointsOff, $labels ? implode(' · ', $labels) : null);
        $quote['coupon'] = $coupon ? ['code' => $coupon->code, 'discount' => Money::toRupees($couponOff)] : null;
        $quote['loyalty'] = $points ? ['points' => $points, 'discount' => Money::toRupees($pointsOff)] : null;

        return [$quote, ['coupon' => $coupon, 'coupon_off' => $couponOff, 'loyalty_customer' => $loyaltyCustomer, 'points' => $points]];
    }

    private function coupons(): Coupons
    {
        return app(Coupons::class);
    }

    private function loyalty(): Loyalty
    {
        return app(Loyalty::class);
    }

    /**
     * UPI to the restaurant's own UPI ID has no gateway to confirm it: the guest adds the
     * reference (UTR) from their UPI app, staff match it in their bank app and confirm.
     */
    public function upiReference(Order $order, string $reference): Order
    {
        if ($order->payment_method !== 'upi' || $order->status === 'cancelled' || ! in_array($order->payment_status, ['unpaid', 'pending'], true)) {
            throw new ApiException('This order is not waiting for a UPI payment.', 422, 'not_awaiting_upi');
        }
        $reference = strtoupper($reference);
        $order->update(['payment_reference' => $reference, 'payment_status' => 'pending']);
        $this->event($order, 'upi_reference', "UPI reference {$reference}", null);

        return $order;
    }

    /** Staff saw the UPI money arrive. */
    public function confirmUpi(Order $order, User $by): Order
    {
        if ($order->payment_method !== 'upi' || $order->status === 'cancelled' || ! in_array($order->payment_status, ['unpaid', 'pending'], true)) {
            throw new ApiException('This order is not waiting for a UPI payment.', 422, 'not_awaiting_upi');
        }
        $order->update(['payment_status' => 'paid']);
        $this->event($order, 'payment_received', 'UPI payment received', $by->id);
        AuditLog::record('order.upi_received', $order, ['number' => $order->number, 'total' => $order->total, 'reference' => $order->payment_reference]);

        return $order;
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
            // Cash, counter and UPI payments are settled by the time staff complete the order.
            if ($to === 'completed' && in_array($order->payment_method, ['cod', 'counter', 'upi'], true)) {
                $changes['payment_status'] = 'paid';
            }
            $order->update($changes);
            $this->event($order, $to, $note ? strip_tags($note) : null, $by?->id);
            if ($to === 'cancelled') {
                AuditLog::record('order.cancelled', $order, ['number' => $order->number, 'reason' => $note, 'payment_status' => $order->payment_status]);
            }
        });

        $fresh = $order->fresh();
        $this->kitchen->syncFromOrder($fresh);
        if ($to === 'completed') {
            app(CustomerActivity::class)->orderCompleted($fresh);
        }
        if ($to === 'cancelled') {
            app(CustomerActivity::class)->orderCancelled($fresh);
            if ($fresh->room_booking_id) {
                app(Folio::class)->orderCancelled($fresh);
            }
        }
        $this->emitOrder($fresh, 'order.changed');
        $this->notifier->statusChanged($fresh);

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
                app(CustomerActivity::class)->orderCancelled($order);
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
        $this->kitchen->createFor($order);
        $this->emitOrder($order, 'order.created');
    }

    /** Live update for the Orders board (and the table board for dine-in). */
    public function emitOrder(Order $order, string $name): void
    {
        Live::emit($order->tenant_id, 'orders', $name, ['id' => $order->id, 'number' => $order->number, 'status' => $order->status, 'type' => $order->type]);
        if ($order->dining_table_id) {
            Live::emit($order->tenant_id, 'tables', 'table.changed', ['table_id' => $order->dining_table_id]);
        }
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
