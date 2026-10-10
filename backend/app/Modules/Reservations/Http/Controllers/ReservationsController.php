<?php

namespace App\Modules\Reservations\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Reservations\Models\ReservationSlot;
use App\Modules\Reservations\Services\Availability;
use App\Modules\Reservations\Services\Bookings;
use App\Modules\Reservations\Services\ReservationPresenter;
use App\Modules\Reservations\Services\ReservationSettings;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Dashboard → Reservations: the day's bookings, actions, manual bookings, settings and slots. */
class ReservationsController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly ReservationPresenter $presenter,
        private readonly ReservationSettings $settings,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tz = $this->context->require()->timezone;
        $data = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'status' => ['nullable', Rule::in([...Reservation::STATUSES, 'upcoming'])],
            'q' => ['nullable', 'string', 'max:60'],
        ]);
        $date = $data['date'] ?? CarbonImmutable::now($tz)->format('Y-m-d');
        $status = $data['status'] ?? null;
        $q = trim((string) ($data['q'] ?? ''));

        $query = Reservation::with('table')->orderBy('starts_at')->orderBy('id');
        if ($q !== '') {
            // Searching looks across all dates.
            $digits = preg_replace('/\D+/', '', $q);
            $query->where(fn ($w) => $w->where('code', strtoupper($q))->orWhere('name', 'like', "%{$q}%")
                ->when(strlen($digits) >= 4, fn ($w) => $w->orWhere('phone', 'like', "%{$digits}%")))->limit(50);
        } elseif ($status === 'upcoming') {
            $query->whereIn('status', ['pending', 'confirmed'])->where('starts_at', '>=', now()->subHours(3))->limit(100);
        } else {
            $query->whereDate('date', $date)->when($status, fn ($w) => $w->where('status', $status));
        }

        $day = Reservation::whereDate('date', $date);

        return $this->ok([
            'date' => $date,
            'reservations' => $query->get()->map(fn ($r) => $this->presenter->forStaff($r))->values(),
            // For choosing a table (front desk staff may not see the table setup).
            'tables' => \App\Modules\Tables\Models\DiningTable::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get(['id', 'label', 'seats']),
            'summary' => [
                'bookings' => (clone $day)->whereIn('status', Reservation::HOLDING)->count(),
                'guests' => (int) (clone $day)->whereIn('status', Reservation::HOLDING)->sum('party_size'),
                'pending' => Reservation::where('status', 'pending')->where('starts_at', '>', now())->count(),
            ],
        ]);
    }

    /** Free times for a manual booking (with how full each slot is). */
    public function availability(Request $request, Availability $availability): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
        ]);

        return $this->ok($availability->forDate($this->context->require(), $data['date'], (int) $data['party_size']));
    }

    /** Phone or walk-in booking entered by staff (confirmed straight away). */
    public function store(Request $request, Bookings $bookings): JsonResponse
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'time' => ['required', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'party_size' => ['required', 'integer', 'min:1', 'max:100'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'notes' => ['nullable', 'string', 'max:500'],
            'source' => ['required', Rule::in(['phone', 'walk_in'])],
            'dining_table_id' => ['nullable', 'integer', Rule::exists('dining_tables', 'id')->where('tenant_id', $this->context->id())->whereNull('deleted_at')],
            'force' => ['boolean'],
        ], ['phone.regex' => Phone::MESSAGE]);

        $r = $bookings->create($this->context->require(), $data, $data['source'], $request->user(), (bool) ($data['force'] ?? false));

        return $this->created($this->presenter->forStaff($r), 'Booking added.');
    }

    public function transition(Request $request, int $id, Bookings $bookings): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(Reservation::STATUSES)],
            'note' => ['nullable', 'string', 'max:300'],
        ]);
        $r = $bookings->transition(Reservation::findOrFail($id), $data['status'], $request->user(), $data['note'] ?? null);

        return $this->ok($this->presenter->forStaff($r));
    }

    public function assignTable(Request $request, int $id, Bookings $bookings): JsonResponse
    {
        $data = $request->validate([
            'dining_table_id' => ['nullable', 'integer', Rule::exists('dining_tables', 'id')->where('tenant_id', $this->context->id())->whereNull('deleted_at')],
        ]);

        return $this->ok($this->presenter->forStaff($bookings->assignTable(Reservation::findOrFail($id), $data['dining_table_id'] ?? null)));
    }

    /** New website bookings since `after` (for the alert sound) and the pending count. */
    public function feed(Request $request): JsonResponse
    {
        $after = (int) $request->query('after', 0);

        return $this->ok([
            'latest_id' => (int) Reservation::max('id'),
            'new' => Reservation::where('id', '>', $after)->where('source', 'website')->orderBy('id')->limit(20)->get()
                ->map(fn ($r) => ['id' => $r->id, 'code' => $r->code, 'name' => $r->name, 'party_size' => $r->party_size, 'date' => $r->date->format('Y-m-d'), 'time' => $r->time, 'status' => $r->status])->values(),
            'pending' => Reservation::where('status', 'pending')->where('starts_at', '>', now())->count(),
        ]);
    }

    public function settings(TenantSettings $tenantSettings): JsonResponse
    {
        return $this->ok($this->settingsPayload($tenantSettings));
    }

    public function updateSettings(Request $request, TenantSettings $tenantSettings): JsonResponse
    {
        $this->settings->save($request->validate(ReservationSettings::rules(), [
            'max_party.gte' => 'The largest party must be at least the smallest.',
        ]));

        return $this->ok($this->settingsPayload($tenantSettings), 'Saved.');
    }

    /**
     * Replace the weekly slots. An empty list goes back to slots from opening hours.
     */
    public function updateSlots(Request $request, TenantSettings $tenantSettings): JsonResponse
    {
        $data = $request->validate([
            'slots' => ['present', 'array', 'max:700'],
            'slots.*.day' => ['required', Rule::in(OpeningHours::DAYS)],
            'slots.*.time' => ['required', 'regex:/^([01]\d|2[0-3]):[0-5]\d$/'],
            'slots.*.capacity' => ['required', 'integer', 'min:1', 'max:500'],
            'slots.*.is_active' => ['required', 'boolean'],
        ]);
        $keys = array_map(fn ($s) => "{$s['day']} {$s['time']}", $data['slots']);
        if (count($keys) !== count(array_unique($keys))) {
            throw new ApiException('The same day and time is listed twice.', 422, 'duplicate_slot');
        }
        DB::transaction(function () use ($data) {
            ReservationSlot::query()->delete();
            foreach ($data['slots'] as $s) {
                ReservationSlot::create($s);
            }
        });

        return $this->ok($this->settingsPayload($tenantSettings), 'Saved.');
    }

    private function settingsPayload(TenantSettings $tenantSettings): array
    {
        $s = $this->settings->get();
        $custom = ReservationSlot::exists();
        $hours = (array) $tenantSettings->get('opening_hours', []);
        $slots = $custom
            ? ReservationSlot::orderBy('day')->orderBy('time')->get(['day', 'time', 'capacity', 'is_active'])->toArray()
            : collect(OpeningHours::DAYS)->flatMap(fn ($d) => array_map(
                fn ($x) => ['day' => $d, 'time' => $x['time'], 'capacity' => $x['capacity'], 'is_active' => true],
                Availability::generate($hours[$d] ?? null, $s['slot_minutes'], $s['duration_minutes'], $s['default_capacity']),
            ))->values()->all();

        return ['settings' => $s, 'slots' => $slots, 'custom_slots' => $custom, 'opening_hours' => $hours ?: null];
    }
}
