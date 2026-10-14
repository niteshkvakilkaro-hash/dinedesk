<?php

namespace App\Modules\Hotel\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Crm\Services\CustomerActivity;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Notifications\StayNotifier;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\OrderEvent;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Services\Razorpay;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use App\Support\Locale;
use App\Support\Phone;
use App\Support\Realtime\Live;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Room bookings: pending → confirmed → checked_in → checked_out, or cancelled / no_show.
 * A booking takes one room of its type for its nights (the room itself is assigned by the
 * front desk). The hotel can never be sold beyond its rooms, from the website or the desk.
 */
class RoomBookings
{
    public const TRANSITIONS = [
        'pending' => ['confirmed', 'cancelled'],
        'confirmed' => ['cancelled', 'no_show'],
        'checked_in' => [],
        'checked_out' => [],
        'cancelled' => [],
        'no_show' => [],
    ];

    private const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(
        private readonly HotelSettings $settings,
        private readonly RoomPricing $pricing,
        private readonly RoomAvailability $availability,
        private readonly Folio $folio,
        private readonly StayNotifier $notifier,
    ) {}

    /**
     * Website bookings follow every rule (and may need an advance paid online).
     * Front-desk bookings (phone, walk-in) are confirmed at once.
     *
     * @return array{booking: RoomBooking, razorpay: ?array}
     */
    public function create(Tenant $tenant, array $data, string $source = 'website', ?User $by = null, string $locale = 'en'): array
    {
        $s = $this->settings->get();
        $website = $source === 'website';
        if ($website && ! $s['online_booking']) {
            throw new ApiException('Online room booking is not available right now. Please call us.', 422, 'not_accepting');
        }
        $type = RoomType::where('is_active', true)->find($data['room_type_id']);
        if (! $type) {
            throw new ApiException('That room type is not available.', 422, 'type_unavailable', ['field' => 'room_type_id']);
        }
        $this->checkDates($tenant, $data['check_in'], $data['check_out'], $website);
        $quote = $this->pricing->quote($type, $data['check_in'], $data['check_out'], (int) $data['adults'], (int) ($data['children'] ?? 0));

        $advancePct = $website ? (int) $s['advance_percent'] : 0;
        $online = $advancePct > 0;
        if ($online && ! app(OrderingSettings::class)->razorpayConfigured()) {
            // No way to take the advance online: the hotel confirms and collects at the desk.
            $online = false;
            $advancePct = 0;
        }

        $booking = DB::transaction(function () use ($tenant, $data, $source, $locale, $s, $type, $quote, $website, $online, $advancePct) {
            // One booking at a time per business, so two guests can't take the last room together.
            Tenant::whereKey($tenant->id)->lockForUpdate()->first();
            if ($this->availability->freeRooms($type, $data['check_in'], $data['check_out']) < 1) {
                throw new ApiException("No {$type->name} rooms are free for those dates.", 422, 'sold_out', ['field' => 'check_in']);
            }
            $room = null;
            if (! empty($data['room_id'])) {
                $room = $this->roomFor($type, (int) $data['room_id'], $data['check_in'], $data['check_out'], null);
            }

            $phone = Phone::normalize($data['phone']);
            $customer = Customer::firstOrNew(['phone' => $phone]);
            $customer->fill(['name' => strip_tags($data['name']), 'email' => $data['email'] ?? $customer->email])->save();

            $total = Money::toPaise($quote['total']);
            $advance = $advancePct ? (int) (ceil($total * $advancePct / 100 / 100) * 100) : 0;
            $status = $online ? 'pending' : ($website && ! $s['auto_confirm'] ? 'pending' : 'confirmed');

            return RoomBooking::create([
                'code' => $this->newCode(),
                'access_token' => Str::random(40),
                'customer_id' => $customer->id,
                'room_type_id' => $type->id,
                'room_id' => $room?->id,
                'name' => strip_tags($data['name']),
                'phone' => $phone,
                'email' => $data['email'] ?? null,
                'adults' => (int) $data['adults'],
                'children' => (int) ($data['children'] ?? 0),
                'check_in' => $data['check_in'],
                'check_out' => $data['check_out'],
                'nights' => $quote['nights'],
                'rates' => $quote['rates'],
                'room_total' => $quote['room_total'],
                'tax_total' => $quote['tax_total'],
                'total' => $quote['total'],
                'advance_due' => Money::toRupees(min($advance, $total)),
                'status' => $status,
                'source' => $source,
                'arrival_time' => $data['arrival_time'] ?? null,
                'requests' => isset($data['requests']) ? strip_tags($data['requests']) : null,
                'staff_note' => isset($data['staff_note']) ? strip_tags($data['staff_note']) : null,
                'company' => isset($data['company']) ? strip_tags($data['company']) : null,
                'gstin' => ! empty($data['gstin']) ? strtoupper($data['gstin']) : null,
                'hold_expires_at' => $online ? now()->addMinutes($s['hold_minutes']) : null,
                'confirmed_at' => $status === 'confirmed' ? now() : null,
                'locale' => Locale::guest($locale),
            ]);
        });

        $razorpay = null;
        if ($online) {
            $razorpay = $this->razorpayFor($tenant, $booking);
        } else {
            $this->notifier->send($booking, $booking->status === 'pending' ? 'received' : 'confirmed');
            if ($website) {
                $this->alertStaff($tenant, $booking);
            }
        }
        if ($by) {
            AuditLog::record('stay.created', $booking, ['code' => $booking->code, 'source' => $source]);
        }
        $this->emit($booking);

        return ['booking' => $booking->fresh(['type', 'room']), 'razorpay' => $razorpay];
    }

    /** Razorpay order for a booking's advance (also used to retry a failed payment). */
    public function razorpayFor(Tenant $tenant, RoomBooking $b): array
    {
        $razorpay = app(Razorpay::class);
        $rzp = $razorpay->createOrder(Money::toPaise($b->advance_due), 'stay-'.$b->code, ['stay' => $b->public_id]);
        Payment::create([
            'room_booking_id' => $b->id,
            'provider_order_id' => $rzp['id'],
            'amount' => $b->advance_due,
            'currency' => 'INR',
            'status' => 'created',
        ]);

        return [
            'key_id' => $razorpay->keyId(),
            'order_id' => $rzp['id'],
            'amount' => $rzp['amount'],
            'currency' => 'INR',
            'name' => $tenant->name,
            'description' => "Advance for room booking {$b->code}",
            'prefill' => ['name' => $b->name, 'contact' => $b->phone, 'email' => $b->email],
        ];
    }

    /** The advance came in (checkout callback or webhook). Safe to call twice. */
    public function advancePaid(Payment $payment, string $providerPaymentId, ?string $method = null): void
    {
        $tenant = null;
        $notify = null;
        DB::transaction(function () use ($payment, $providerPaymentId, $method, &$tenant, &$notify) {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($payment->status === 'captured') {
                return;
            }
            $payment->update(['status' => 'captured', 'provider_payment_id' => $providerPaymentId, 'method' => $method, 'error' => null]);
            $b = RoomBooking::whereKey($payment->room_booking_id)->lockForUpdate()->firstOrFail();
            $tenant = $b->tenant()->first();
            Tenant::whereKey($tenant->id)->lockForUpdate()->first();
            $this->folio->addPayment($b, 'advance', 'online', $payment->amount, $providerPaymentId, null);

            if ($b->status === 'pending') {
                $b->update(['status' => 'confirmed', 'confirmed_at' => now(), 'hold_expires_at' => null]);
                $notify = $b;
            } elseif ($b->status === 'cancelled' && $b->cancelled_by === 'system') {
                // Paid after the hold ran out: take the room back if it is still free, otherwise flag a refund.
                $free = $this->availability->freeRooms($b->type()->first(), $b->check_in->format('Y-m-d'), $b->check_out->format('Y-m-d'), $b->id) >= 1;
                if ($free) {
                    $b->update(['status' => 'confirmed', 'confirmed_at' => now(), 'hold_expires_at' => null, 'cancelled_by' => null, 'cancel_reason' => null]);
                    $notify = $b;
                } else {
                    AuditLog::record('stay.paid_after_release', $b, ['code' => $b->code, 'amount' => $payment->amount], $b->tenant_id);
                }
            }
        });
        if ($notify) {
            $this->notifier->send($notify, 'confirmed');
            $this->alertStaff($tenant, $notify);
            $this->emit($notify);
        }
    }

    public function advanceFailed(Payment $payment, ?string $error): void
    {
        if ($payment->status !== 'captured') {
            $payment->update(['status' => 'failed', 'error' => $error ? Str::limit($error, 250) : null]);
        }
    }

    /** Website bookings whose advance never came in release their room. */
    public function expireHolds(): int
    {
        $count = 0;
        RoomBooking::where('status', 'pending')->whereNotNull('hold_expires_at')->where('hold_expires_at', '<', now())
            ->each(function (RoomBooking $b) use (&$count) {
                $b->update(['status' => 'cancelled', 'cancelled_by' => 'system', 'cancel_reason' => 'Advance not paid in time', 'hold_expires_at' => null]);
                $this->emit($b);
                $count++;
            });

        return $count;
    }

    /** Front desk: confirm a request, cancel, or mark a no-show. */
    public function transition(RoomBooking $b, string $to, User $by, ?string $note = null): RoomBooking
    {
        if (! in_array($to, self::TRANSITIONS[$b->status] ?? [], true)) {
            throw new ApiException("A booking that is {$this->label($b->status)} can't be marked {$this->label($to)}.", 422, 'invalid_transition');
        }
        if ($to === 'cancelled' && ! trim((string) $note)) {
            throw new ApiException('Please give a reason for cancelling.', 422, 'reason_required', ['field' => 'note']);
        }
        if ($to === 'no_show' && $this->today($b) < $b->check_in->format('Y-m-d')) {
            throw new ApiException('You can mark a no-show from the check-in day.', 422, 'too_early');
        }
        if ($to === 'confirmed' && $b->hold_expires_at) {
            throw new ApiException('This booking is waiting for its online advance.', 422, 'awaiting_payment');
        }
        $changes = ['status' => $to];
        if ($to === 'confirmed') {
            $changes['confirmed_at'] = now();
        }
        if ($to === 'cancelled') {
            $changes += ['cancelled_by' => 'staff', 'cancel_reason' => strip_tags((string) $note), 'hold_expires_at' => null];
        }
        $b->update($changes);
        if ($to !== 'confirmed') {
            AuditLog::record("stay.{$to}", $b, ['code' => $b->code, 'note' => $note]);
        }
        match ($to) {
            'confirmed' => $this->notifier->send($b, 'confirmed'),
            'cancelled' => $this->notifier->send($b, 'cancelled', $note),
            default => null,
        };
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    /** The guest cancels online, up to the hotel's cut-off. */
    public function cancelByGuest(RoomBooking $b): RoomBooking
    {
        if (! in_array($b->status, ['pending', 'confirmed'], true)) {
            throw new ApiException('This booking can no longer be cancelled online.', 422, 'not_cancellable');
        }
        if (! $this->guestCanCancel($b)) {
            throw new ApiException('Online cancellation has closed for this booking. Please call the hotel.', 422, 'not_cancellable');
        }
        $b->update(['status' => 'cancelled', 'cancelled_by' => 'guest', 'hold_expires_at' => null]);
        $this->notifier->send($b, 'cancelled');
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    public function guestCanCancel(RoomBooking $b): bool
    {
        if (! in_array($b->status, ['pending', 'confirmed'], true)) {
            return false;
        }
        $days = (int) $this->settings->get()['free_cancel_days'];
        $today = $this->today($b);
        $deadline = $b->check_in->copy()->subDays($days)->format('Y-m-d');

        return $today < $b->check_in->format('Y-m-d') && $today <= $deadline;
    }

    /** Give the booking a room (or take it off one). */
    public function assignRoom(RoomBooking $b, ?int $roomId, User $by): RoomBooking
    {
        if (! in_array($b->status, ['pending', 'confirmed', 'checked_in'], true)) {
            throw new ApiException('Rooms can be changed only for upcoming or current stays.', 422, 'invalid_transition');
        }
        if (! $roomId && $b->status === 'checked_in') {
            throw new ApiException('A guest who has checked in needs a room.', 422, 'room_required');
        }
        DB::transaction(function () use ($b, $roomId, $by) {
            Tenant::whereKey($b->tenant_id)->lockForUpdate()->first();
            $room = $roomId ? $this->roomFor($b->type()->first(), $roomId, $b->check_in->format('Y-m-d'), $b->check_out->format('Y-m-d'), $b->id) : null;
            $old = $b->room_id;
            $b->update(['room_id' => $room?->id]);
            if ($b->status === 'checked_in' && $old && $old !== $room->id) {
                // Moved mid-stay: the old room needs cleaning; the nights now show the new room.
                app(Housekeeping::class)->set(Room::find($old), 'dirty', "Guest moved to room {$room->number}", $by);
                $this->folio->syncRoomCharges($b->fresh(), $by);
                AuditLog::record('stay.room_moved', $b, ['code' => $b->code, 'from' => $old, 'to' => $room->id]);
            }
        });
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    /**
     * Check the guest in: a room is needed (free, and ready unless staff override), and the
     * stay's nights go on the folio.
     */
    public function checkIn(RoomBooking $b, array $data, User $by): RoomBooking
    {
        if ($b->status !== 'confirmed') {
            throw new ApiException($b->status === 'pending' ? 'Confirm the booking first.' : "A booking that is {$this->label($b->status)} can't be checked in.", 422, 'invalid_transition');
        }
        $today = $this->today($b);
        if ($today < $b->check_in->format('Y-m-d')) {
            throw new ApiException('This booking starts on '.$b->check_in->format('j M').'. Change the dates to check in today.', 422, 'too_early');
        }
        if ($today >= $b->check_out->format('Y-m-d')) {
            throw new ApiException('The stay dates have passed. Change the dates first.', 422, 'dates_passed');
        }
        DB::transaction(function () use ($b, $data, $by) {
            Tenant::whereKey($b->tenant_id)->lockForUpdate()->first();
            $roomId = (int) ($data['room_id'] ?? $b->room_id);
            if (! $roomId) {
                throw new ApiException('Choose a room for the guest.', 422, 'room_required', ['field' => 'room_id']);
            }
            $room = $this->roomFor($b->type()->first(), $roomId, $b->check_in->format('Y-m-d'), $b->check_out->format('Y-m-d'), $b->id);
            if (! $room->isReady() && empty($data['force'])) {
                throw new ApiException("Room {$room->number} is marked {$this->label($room->housekeeping)}. Check it in anyway?", 422, 'room_not_ready');
            }
            $b->update(array_filter([
                'room_id' => $room->id,
                'status' => 'checked_in',
                'checked_in_at' => now(),
                'id_type' => $data['id_type'] ?? null,
                'id_last4' => $data['id_last4'] ?? null,
                'gstin' => ! empty($data['gstin']) ? strtoupper($data['gstin']) : null,
                'company' => isset($data['company']) ? strip_tags($data['company']) : null,
            ], fn ($v) => $v !== null));
            $this->folio->syncRoomCharges($b->fresh(['type', 'room']), $by);
            AuditLog::record('stay.checked_in', $b, ['code' => $b->code, 'room' => $room->number]);
        });
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    /**
     * New dates. Nights already on the stay keep their price (including any agreed rate);
     * added nights are priced afresh. A guest who has checked in keeps the check-in date.
     */
    public function changeDates(RoomBooking $b, string $in, string $out, User $by): RoomBooking
    {
        if (! in_array($b->status, ['pending', 'confirmed', 'checked_in'], true)) {
            throw new ApiException('Dates can be changed only for upcoming or current stays.', 422, 'invalid_transition');
        }
        $tenant = $b->tenant()->first();
        if ($b->status === 'checked_in') {
            $in = $b->check_in->format('Y-m-d');
            if ($out <= $this->today($b)) {
                throw new ApiException('Check-out can\'t be before tomorrow for a guest in the hotel. Check them out instead.', 422, 'invalid_dates', ['field' => 'check_out']);
            }
        } else {
            $this->checkDates($tenant, $in, $out, false);
        }
        DB::transaction(function () use ($b, $in, $out, $by) {
            Tenant::whereKey($b->tenant_id)->lockForUpdate()->first();
            $type = $b->type()->first();
            if ($this->availability->freeRooms($type, $in, $out, $b->id) < 1) {
                throw new ApiException("No {$type->name} room is free for the new dates.", 422, 'sold_out', ['field' => 'check_in']);
            }
            if ($b->room_id && ($clash = $this->availability->roomFree($b->room()->first(), $in, $out, $b->id))) {
                throw new ApiException("Room {$b->room->number} is booked by {$clash->name} on those dates. Change the room first.", 422, 'room_taken');
            }
            $quote = $this->pricing->quote($type, $in, $out, $b->adults, $b->children);
            $old = collect($b->rates)->keyBy('date');
            $rates = array_map(fn ($r) => $old->get($r['date'], $r), $quote['rates']);
            $this->applyRates($b, $rates, ['check_in' => $in, 'check_out' => $out]);
            if ($b->status === 'checked_in') {
                $this->folio->syncRoomCharges($b->fresh(['type', 'room']), $by);
            }
            AuditLog::record('stay.dates_changed', $b, ['code' => $b->code, 'check_in' => $in, 'check_out' => $out]);
        });
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    /** An agreed nightly price (before GST) for every night of the stay. Audited. */
    public function setRate(RoomBooking $b, float|string $price, string $reason, User $by): RoomBooking
    {
        if (! in_array($b->status, ['pending', 'confirmed', 'checked_in'], true)) {
            throw new ApiException('The rate can be changed only for upcoming or current stays.', 422, 'invalid_transition');
        }
        $paise = Money::toPaise($price);
        if ($paise < 0) {
            throw new ApiException('Enter a price.', 422, 'invalid_amount', ['field' => 'price']);
        }
        $gst = (bool) $this->settings->get()['charge_gst'];
        $rates = array_map(function ($r) use ($paise, $gst) {
            $rate = $gst ? RoomPricing::gstRate($paise) : 0;

            return ['date' => $r['date'], 'price' => Money::toRupees($paise), 'tax_rate' => number_format($rate, 2, '.', ''), 'tax' => Money::toRupees(Money::taxOnTop($paise, Money::rateBp($rate))), 'season' => null, 'weekend' => $r['weekend'] ?? false];
        }, $b->rates);
        DB::transaction(function () use ($b, $rates, $by) {
            $this->applyRates($b, $rates, []);
            if ($b->status === 'checked_in') {
                $this->folio->syncRoomCharges($b->fresh(['type', 'room']), $by);
            }
        });
        AuditLog::record('stay.rate_changed', $b, ['code' => $b->code, 'price' => Money::toRupees($paise), 'reason' => strip_tags($reason)]);
        $this->emit($b);

        return $b->fresh(['type', 'room']);
    }

    /**
     * Check the guest out: room-service orders must be finished, the folio settled (the last
     * payments are taken here), the GST invoice made, and the room goes to housekeeping.
     * Leaving early can charge only the nights stayed.
     *
     * @param  list<array{mode: string, amount: float|string, reference?: ?string}>  $payments
     */
    public function checkOut(RoomBooking $b, array $payments, bool $chargeNightsStayed, ?array $buyer, User $by): RoomBooking
    {
        if ($b->status !== 'checked_in') {
            throw new ApiException('Only a guest who has checked in can check out.', 422, 'invalid_transition');
        }
        $open = Order::where('room_booking_id', $b->id)->whereNotIn('status', ['completed', 'cancelled'])->pluck('number');
        if ($open->isNotEmpty()) {
            throw new ApiException('Room-service order #'.$open->implode(', #').' is still open. Complete or cancel it first.', 422, 'orders_open');
        }
        $tenant = $b->tenant()->first();
        DB::transaction(function () use ($b, $payments, $chargeNightsStayed, $buyer, $by, $tenant) {
            $b = RoomBooking::whereKey($b->id)->lockForUpdate()->firstOrFail();
            $today = $this->today($b);
            if ($chargeNightsStayed && $today < $b->check_out->format('Y-m-d')) {
                $last = max($today, CarbonImmutable::parse($b->check_in)->addDay()->format('Y-m-d'));
                $rates = array_values(array_filter($b->rates, fn ($r) => $r['date'] < $last));
                $this->applyRates($b, $rates, ['check_out' => $last]);
                $this->folio->syncRoomCharges($b->fresh(['type', 'room']), $by);
            }
            foreach ($payments as $p) {
                if (Money::toPaise($p['amount']) > 0) {
                    $this->folio->addPayment($b, 'payment', $p['mode'], $p['amount'], $p['reference'] ?? null, $by);
                }
            }
            $summary = $this->folio->summary($b);
            if ($summary['balance_paise'] > 0) {
                throw new ApiException('₹'.Money::toRupees($summary['balance_paise']).' is still due.', 422, 'balance_due');
            }
            if ($summary['balance_paise'] < 0) {
                throw new ApiException('The guest has paid ₹'.Money::toRupees(-$summary['balance_paise']).' more than the bill. Record a refund first.', 422, 'overpaid');
            }
            $invoice = $this->folio->invoice($tenant, $b, $buyer, $by);
            $b->update(['status' => 'checked_out', 'checked_out_at' => now(), 'invoice_id' => $invoice->id]);

            // Room-service orders are paid with the stay.
            foreach (Order::where('room_booking_id', $b->id)->where('status', 'completed')->where('payment_status', '!=', 'paid')->get() as $order) {
                $order->update(['payment_status' => 'paid']);
                OrderEvent::create(['order_id' => $order->id, 'status' => 'payment', 'note' => "Paid at check-out ({$invoice->number})", 'user_id' => $by->id, 'created_at' => now()]);
            }
            app(Housekeeping::class)->set($b->room()->first(), 'dirty', "Check-out {$b->code}", $by);
            AuditLog::record('stay.checked_out', $b, ['code' => $b->code, 'invoice' => $invoice->number, 'total' => $invoice->total]);
        });
        app(CustomerActivity::class)->bookingVisited($b->customer_id);
        $this->emit($b);

        return $b->fresh(['type', 'room', 'invoice']);
    }

    private function applyRates(RoomBooking $b, array $rates, array $extra): void
    {
        $sum = array_sum(array_map(fn ($r) => Money::toPaise($r['price']), $rates));
        $tax = array_sum(array_map(fn ($r) => Money::toPaise($r['tax']), $rates));
        $b->update($extra + [
            'rates' => array_values($rates),
            'nights' => count($rates),
            'room_total' => Money::toRupees($sum),
            'tax_total' => Money::toRupees($tax),
            'total' => Money::toRupees($sum + $tax),
        ]);
    }

    private function roomFor(RoomType $type, int $roomId, string $in, string $out, ?int $exceptId): Room
    {
        $room = Room::where('is_active', true)->find($roomId);
        if (! $room || $room->room_type_id !== $type->id) {
            throw new ApiException("Choose a {$type->name} room.", 422, 'invalid_room', ['field' => 'room_id']);
        }
        if ($room->housekeeping === 'out_of_order') {
            throw new ApiException("Room {$room->number} is out of order.", 422, 'room_out_of_order', ['field' => 'room_id']);
        }
        if ($clash = $this->availability->roomFree($room, $in, $out, $exceptId)) {
            throw new ApiException("Room {$room->number} is booked by {$clash->name} from ".$clash->check_in->format('j M').'.', 422, 'room_taken', ['field' => 'room_id']);
        }

        return $room;
    }

    private function checkDates(Tenant $tenant, string $in, string $out, bool $website): void
    {
        $s = $this->settings->get();
        $today = CarbonImmutable::now($tenant->timezone)->format('Y-m-d');
        if ($in < $today) {
            throw new ApiException('Check-in can\'t be in the past.', 422, 'invalid_dates', ['field' => 'check_in']);
        }
        if ($out <= $in) {
            throw new ApiException('Check-out must be after check-in.', 422, 'invalid_dates', ['field' => 'check_out']);
        }
        $nights = (int) CarbonImmutable::parse($in)->diffInDays(CarbonImmutable::parse($out));
        if ($website && $nights > $s['max_nights']) {
            throw new ApiException("Online bookings are for up to {$s['max_nights']} nights. Please call us for a longer stay.", 422, 'too_long', ['field' => 'check_out']);
        }
        if ($website && $in > CarbonImmutable::now($tenant->timezone)->addDays($s['max_days_ahead'])->format('Y-m-d')) {
            throw new ApiException('Bookings open '.$s['max_days_ahead'].' days ahead.', 422, 'too_far', ['field' => 'check_in']);
        }
    }

    private function alertStaff(Tenant $tenant, RoomBooking $b): void
    {
        StayNotifier::staff($tenant, [
            'kind' => 'room_booking', 'booking_id' => $b->id, 'code' => $b->code, 'name' => $b->name,
            'check_in' => $b->check_in->format('Y-m-d'), 'check_out' => $b->check_out->format('Y-m-d'), 'status' => $b->status,
        ]);
    }

    private function today(RoomBooking $b): string
    {
        return CarbonImmutable::now($b->tenant()->first()->timezone)->format('Y-m-d');
    }

    private function newCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (RoomBooking::where('code', $code)->exists());

        return $code;
    }

    private function label(string $status): string
    {
        return str_replace('_', ' ', $status);
    }

    public function emit(RoomBooking $b): void
    {
        Live::emit($b->tenant_id, 'hotel', 'stay.changed', ['id' => $b->id, 'status' => $b->status]);
    }
}
