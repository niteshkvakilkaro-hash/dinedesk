<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Services\Availability;
use App\Modules\Reservations\Services\Bookings;
use App\Modules\Reservations\Services\ReservationPresenter;
use App\Modules\Reservations\Services\ReservationSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Guests booking a table on a business website (tenant from host). */
class PublicReservationController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly ReservationSettings $settings,
        private readonly ReservationPresenter $presenter,
    ) {}

    /** Free times on a date for a party (only whether each is free, never how full). */
    public function availability(Request $request, Availability $availability): JsonResponse
    {
        $s = $this->open();
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'party_size' => ['required', 'integer', "min:{$s['min_party']}", "max:{$s['max_party']}"],
        ]);
        $day = $availability->forDate($this->context->require(), $data['date'], (int) $data['party_size'], null, $s);

        return $this->ok([
            'date' => $day['date'],
            'problem' => $day['problem'],
            'slots' => array_map(fn ($slot) => ['time' => $slot['time'], 'available' => $slot['available']], $day['slots']),
        ]);
    }

    public function store(Request $request, Bookings $bookings): JsonResponse
    {
        $this->open();
        $this->normalizePhone($request);
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'time' => ['required', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'notes' => ['nullable', 'string', 'max:500'],
        ], ['phone.regex' => Phone::MESSAGE]);

        $r = $bookings->create($this->context->require(), $data, 'website', null, false, (string) $request->header('X-Locale', 'en'));

        return $this->created($this->presenter->forGuest($r), $r->status === 'confirmed' ? 'Your table is booked.' : 'Booking request received.');
    }

    /** Check a booking with its ID and the phone number used. */
    public function lookup(Request $request): JsonResponse
    {
        return $this->ok($this->presenter->forGuest($this->find($request)));
    }

    public function cancel(Request $request, Bookings $bookings): JsonResponse
    {
        return $this->ok($this->presenter->forGuest($bookings->cancelByGuest($this->find($request))), 'Your booking has been cancelled.');
    }

    private function find(Request $request): Reservation
    {
        $this->normalizePhone($request);
        $data = $request->validate([
            'code' => ['required', 'string', 'max:12'],
            'phone' => ['required', 'string', 'max:20'],
        ]);
        $r = Reservation::where('code', strtoupper(trim($data['code'])))->first();
        // Same answer whether the code or the phone is wrong.
        if (! $r || ! hash_equals($r->phone, (string) $data['phone'])) {
            throw new ApiException('We could not find a booking with that ID and phone number.', 404, 'not_found');
        }

        return $r;
    }

    private function open(): array
    {
        $s = $this->settings->get();
        if (! $s['enabled']) {
            throw new ApiException('Online table booking is not available right now. Please call us.', 422, 'not_accepting');
        }

        return $s;
    }

    private function normalizePhone(Request $request): void
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
    }
}
