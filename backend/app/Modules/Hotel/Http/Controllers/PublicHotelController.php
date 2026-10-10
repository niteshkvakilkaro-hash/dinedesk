<?php

namespace App\Modules\Hotel\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hotel\Models\BanquetEnquiry;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Notifications\StayNotifier;
use App\Modules\Hotel\Services\HotelPresenter;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Hotel\Services\RoomAvailability;
use App\Modules\Hotel\Services\RoomBookings;
use App\Modules\Hotel\Services\RoomPricing;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Services\Razorpay;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Guests on a hotel's website (tenant from host): rooms, booking, their booking, room QR, events. */
class PublicHotelController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly HotelSettings $settings,
        private readonly HotelPresenter $presenter,
        private readonly RoomBookings $bookings,
    ) {}

    /** The rooms page: every room type on sale and how booking works here. */
    public function rooms(): JsonResponse
    {
        $s = $this->settings->get();
        $types = RoomType::where('is_active', true)->whereHas('rooms', fn ($q) => $q->where('is_active', true))->orderBy('sort_order')->orderBy('id')->get();

        return $this->ok([
            'online_booking' => $s['online_booking'],
            'check_in_time' => $s['check_in_time'],
            'check_out_time' => $s['check_out_time'],
            'advance_percent' => $s['online_booking'] && app(OrderingSettings::class)->razorpayConfigured() ? $s['advance_percent'] : 0,
            'free_cancel_days' => $s['free_cancel_days'],
            'max_nights' => $s['max_nights'],
            'max_days_ahead' => $s['max_days_ahead'],
            'charge_gst' => $s['charge_gst'],
            'house_rules' => $s['house_rules'],
            'house_rules_hi' => $s['house_rules_hi'],
            'types' => $types->map(fn (RoomType $t) => $this->presenter->type($t))->values(),
        ]);
    }

    /** Which room types are free for the dates, with the full price for the guests. */
    public function availability(Request $request, RoomAvailability $availability, RoomPricing $pricing): JsonResponse
    {
        $data = $request->validate([
            'check_in' => ['required', 'date_format:Y-m-d'],
            'check_out' => ['required', 'date_format:Y-m-d', 'after:check_in'],
            'adults' => ['required', 'integer', 'min:1', 'max:20'],
            'children' => ['nullable', 'integer', 'min:0', 'max:20'],
        ], ['check_out.after' => 'Check-out must be after check-in.']);
        $tenant = $this->context->require();
        $s = $this->settings->get();
        $today = CarbonImmutable::now($tenant->timezone)->format('Y-m-d');
        if ($data['check_in'] < $today) {
            throw new ApiException('Check-in can\'t be in the past.', 422, 'invalid_dates', ['field' => 'check_in']);
        }
        $nights = (int) CarbonImmutable::parse($data['check_in'])->diffInDays(CarbonImmutable::parse($data['check_out']));
        if ($nights > $s['max_nights']) {
            throw new ApiException("Online bookings are for up to {$s['max_nights']} nights. Please call us for a longer stay.", 422, 'too_long', ['field' => 'check_out']);
        }
        $adults = (int) $data['adults'];
        $children = (int) ($data['children'] ?? 0);

        $types = $availability->search($data['check_in'], $data['check_out'])->map(function (array $row) use ($pricing, $data, $adults, $children) {
            $t = $row['type'];
            $fits = $adults <= $t->max_adults && $children <= $t->max_children;
            $quote = $fits && $row['free'] > 0 ? $pricing->quote($t, $data['check_in'], $data['check_out'], $adults, $children) : null;

            return [
                'id' => $t->id,
                'available' => $fits && $row['free'] > 0,
                'fits' => $fits,
                // Only "few left" is shown, never the hotel's exact stock.
                'few_left' => $fits && $row['free'] > 0 && $row['free'] <= 2 ? $row['free'] : null,
                'quote' => $quote ? ['nights' => $quote['nights'], 'room_total' => $quote['room_total'], 'tax_total' => $quote['tax_total'], 'total' => $quote['total'], 'rates' => $quote['rates']] : null,
            ];
        })->values();

        return $this->ok(['check_in' => $data['check_in'], 'check_out' => $data['check_out'], 'nights' => $nights, 'types' => $types]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->normalizePhone($request);
        $data = $request->validate([
            'room_type_id' => ['required', 'integer'],
            'check_in' => ['required', 'date_format:Y-m-d'],
            'check_out' => ['required', 'date_format:Y-m-d', 'after:check_in'],
            'adults' => ['required', 'integer', 'min:1', 'max:20'],
            'children' => ['nullable', 'integer', 'min:0', 'max:20'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'arrival_time' => ['nullable', 'date_format:H:i'],
            'requests' => ['nullable', 'string', 'max:500'],
            'gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/'],
            'company' => ['nullable', 'string', 'max:120'],
        ], ['phone.regex' => Phone::MESSAGE, 'gstin.regex' => 'Enter a valid 15-character GSTIN.', 'check_out.after' => 'Check-out must be after check-in.']);
        if (! empty($data['gstin'])) {
            $data['gstin'] = strtoupper($data['gstin']);
        }

        ['booking' => $b, 'razorpay' => $rzp] = $this->bookings->create($this->context->require(), $data, 'website', null, (string) $request->header('X-Locale', 'en'));

        return $this->created(
            ['booking' => $this->presenter->forGuest($b, $this->bookings->guestCanCancel($b)), 'token' => $b->access_token, 'razorpay' => $rzp],
            $rzp ? 'Pay the advance to confirm your room.' : ($b->status === 'confirmed' ? 'Your room is booked.' : 'Booking request received.'),
        );
    }

    public function show(Request $request, string $publicId): JsonResponse
    {
        $b = $this->find($publicId, (string) $request->query('t'));

        return $this->ok($this->presenter->forGuest($b, $this->bookings->guestCanCancel($b)));
    }

    /** Pay the advance again after a failed or closed payment window (while the room is held). */
    public function pay(Request $request, string $publicId): JsonResponse
    {
        $b = $this->find($publicId, (string) $request->input('t'));
        if ($b->status !== 'pending' || ! $b->hold_expires_at || $b->hold_expires_at->isPast()) {
            throw new ApiException('This booking is not waiting for a payment.', 422, 'not_payable');
        }

        return $this->ok(['razorpay' => $this->bookings->razorpayFor($this->context->require(), $b)]);
    }

    public function verifyPayment(Request $request, string $publicId, Razorpay $razorpay): JsonResponse
    {
        $data = $request->validate([
            't' => ['required', 'string'],
            'razorpay_order_id' => ['required', 'string', 'max:64'],
            'razorpay_payment_id' => ['required', 'string', 'max:64'],
            'razorpay_signature' => ['required', 'string', 'max:128'],
        ]);
        $b = $this->find($publicId, $data['t']);
        $payment = Payment::where('room_booking_id', $b->id)->where('provider_order_id', $data['razorpay_order_id'])->first();
        if (! $payment || ! $razorpay->checkoutSignatureValid($data['razorpay_order_id'], $data['razorpay_payment_id'], $data['razorpay_signature'])) {
            throw new ApiException('We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded by your bank.', 422, 'payment_unverified');
        }
        $this->bookings->advancePaid($payment, $data['razorpay_payment_id']);
        $b = $b->fresh();

        return $this->ok($this->presenter->forGuest($b, $this->bookings->guestCanCancel($b)), 'Payment received. Your room is booked.');
    }

    /** Find a booking with its ID and the phone number used; returns the private link parts. */
    public function lookup(Request $request): JsonResponse
    {
        $this->normalizePhone($request);
        $data = $request->validate(['code' => ['required', 'string', 'max:12'], 'phone' => ['required', 'string', 'max:20']]);
        $b = RoomBooking::where('code', strtoupper(trim($data['code'])))->first();
        // Same answer whether the code or the phone is wrong.
        if (! $b || ! hash_equals($b->phone, (string) $data['phone'])) {
            throw new ApiException('We could not find a booking with that ID and phone number.', 404, 'not_found');
        }

        return $this->ok(['id' => $b->public_id, 't' => $b->access_token]);
    }

    public function cancel(Request $request, string $publicId): JsonResponse
    {
        $b = $this->bookings->cancelByGuest($this->find($publicId, (string) $request->input('t')));

        return $this->ok($this->presenter->forGuest($b, false), 'Your booking has been cancelled.');
    }

    /** A room's QR code: which room, and whether its guest can order to the room. */
    public function room(string $token): JsonResponse
    {
        $room = Room::with('type')->where('qr_token', $token)->where('is_active', true)->first();
        if (! $room) {
            throw new ApiException('This room QR code is not active. Please call reception.', 404, 'room_not_found');
        }
        $s = $this->settings->get();

        return $this->ok([
            'number' => $room->number,
            'type' => $room->type->name,
            'room_service' => $s['room_service'],
            'occupied' => RoomBooking::where('room_id', $room->id)->where('status', 'checked_in')->exists(),
        ]);
    }

    public function enquire(Request $request): JsonResponse
    {
        if (! $this->settings->get()['banquets']) {
            throw new ApiException('Event enquiries are not open online. Please call us.', 422, 'not_accepting');
        }
        $this->normalizePhone($request);
        $tenant = $this->context->require();
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'event_type' => ['required', Rule::in(BanquetEnquiry::EVENT_TYPES)],
            'event_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:'.CarbonImmutable::now($tenant->timezone)->format('Y-m-d')],
            'guests' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'message' => ['nullable', 'string', 'max:1000'],
        ], ['phone.regex' => Phone::MESSAGE, 'event_date.after_or_equal' => 'Pick a date from today.']);
        $e = BanquetEnquiry::create([
            'name' => strip_tags($data['name']),
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'event_type' => $data['event_type'],
            'event_date' => $data['event_date'] ?? null,
            'guests' => $data['guests'] ?? null,
            'message' => isset($data['message']) ? strip_tags($data['message']) : null,
            'status' => 'new',
            'locale' => $request->header('X-Locale') === 'hi' ? 'hi' : 'en',
        ]);
        StayNotifier::staff($tenant, ['kind' => 'banquet', 'enquiry_id' => $e->id, 'name' => $e->name, 'event_type' => $e->event_type, 'event_date' => $e->event_date?->format('Y-m-d')]);

        return $this->created(['id' => $e->id], 'Thank you. We will call you soon.');
    }

    private function find(string $publicId, string $token): RoomBooking
    {
        $b = RoomBooking::where('public_id', $publicId)->first();
        if (! $b || $token === '' || ! hash_equals($b->access_token, $token)) {
            throw new ApiException('Booking not found.', 404, 'not_found');
        }

        return $b;
    }

    private function normalizePhone(Request $request): void
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
    }
}
