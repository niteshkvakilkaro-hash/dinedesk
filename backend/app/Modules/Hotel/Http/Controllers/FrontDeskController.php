<?php

namespace App\Modules\Hotel\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\BillPresenter;
use App\Modules\Hotel\Models\BanquetEnquiry;
use App\Modules\Hotel\Models\FolioItem;
use App\Modules\Hotel\Models\FolioPayment;
use App\Modules\Hotel\Models\GuestDocument;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Services\Folio;
use App\Modules\Hotel\Services\GuestDocuments;
use App\Modules\Hotel\Services\HotelPresenter;
use App\Modules\Hotel\Services\RoomAvailability;
use App\Modules\Hotel\Services\RoomBookings;
use App\Modules\Hotel\Services\RoomPricing;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/** Dashboard → Hotel (front desk): today, bookings, calendar, a stay and its folio, banquets. */
class FrontDeskController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly RoomBookings $bookings,
        private readonly HotelPresenter $presenter,
        private readonly Folio $folio,
    ) {}

    /** Arrivals, departures, guests in the hotel, requests waiting, and tonight's rooms. */
    public function today(): JsonResponse
    {
        $tz = $this->context->require()->timezone;
        $today = CarbonImmutable::now($tz)->format('Y-m-d');
        $tomorrow = CarbonImmutable::now($tz)->addDay()->format('Y-m-d');
        $list = fn ($q) => $q->with(['type', 'room'])->get()->map(fn (RoomBooking $b) => $this->presenter->booking($b))->values();

        $rooms = Room::where('is_active', true)->get(['id', 'housekeeping']);
        $occupied = RoomBooking::where('status', 'checked_in')->count();
        $sellable = $rooms->where('housekeeping', '!=', 'out_of_order')->count();
        $tonight = RoomAvailability::overlapping($today, $tomorrow)->count();

        return $this->ok([
            'date' => $today,
            'arrivals' => $list(RoomBooking::whereIn('status', ['confirmed', 'pending'])->where('check_in', '<=', $today)->where('check_out', '>', $today)->whereNull('hold_expires_at')->orderBy('check_in')),
            'departures' => $list(RoomBooking::where('status', 'checked_in')->where('check_out', '<=', $today)->orderBy('check_out')),
            'in_house' => $list(RoomBooking::where('status', 'checked_in')->where('check_out', '>', $today)->orderBy('check_out')),
            'requests' => $list(RoomBooking::where('status', 'pending')->whereNull('hold_expires_at')->orderBy('check_in')),
            'stats' => [
                'rooms' => $rooms->count(),
                'occupied' => $occupied,
                'sold_tonight' => $tonight,
                'free_tonight' => max(0, $sellable - $tonight),
                'dirty' => $rooms->where('housekeeping', 'dirty')->count(),
                'out_of_order' => $rooms->where('housekeeping', 'out_of_order')->count(),
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in([...RoomBooking::STATUSES, 'upcoming'])],
            'q' => ['nullable', 'string', 'max:60'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);
        $today = CarbonImmutable::now($this->context->require()->timezone)->format('Y-m-d');
        $page = RoomBooking::with(['type', 'room'])
            ->when(($data['status'] ?? null) === 'upcoming', fn ($q) => $q->whereIn('status', ['pending', 'confirmed'])->where('check_out', '>', $today))
            ->when(isset($data['status']) && $data['status'] !== 'upcoming', fn ($q) => $q->where('status', $data['status']))
            ->when($data['q'] ?? null, function ($q, $term) {
                $digits = preg_replace('/\D/', '', $term);
                $q->where(fn ($w) => $w->where('name', 'like', '%'.addcslashes($term, '%_').'%')->orWhere('code', strtoupper($term))
                    ->when(strlen($digits) >= 4, fn ($w) => $w->orWhere('phone', 'like', '%'.$digits.'%')));
            })
            ->when($data['from'] ?? null, fn ($q, $d) => $q->where('check_out', '>', $d))
            ->when($data['to'] ?? null, fn ($q, $d) => $q->where('check_in', '<=', $d))
            ->orderByDesc('check_in')->orderByDesc('id')->paginate(30);

        return $this->ok(
            collect($page->items())->map(fn (RoomBooking $b) => $this->presenter->booking($b))->values(),
            meta: ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
        );
    }

    public function calendar(Request $request, RoomAvailability $availability): JsonResponse
    {
        $data = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'days' => ['nullable', 'integer', 'min:7', 'max:31']]);
        $from = $data['from'] ?? CarbonImmutable::now($this->context->require()->timezone)->format('Y-m-d');

        return $this->ok($availability->calendar($from, (int) ($data['days'] ?? 14)));
    }

    /** Free rooms of each type and the price, for a booking taken at the desk. */
    public function availability(Request $request, RoomAvailability $availability, RoomPricing $pricing): JsonResponse
    {
        $data = $request->validate([
            'check_in' => ['required', 'date_format:Y-m-d'],
            'check_out' => ['required', 'date_format:Y-m-d', 'after:check_in'],
            'adults' => ['required', 'integer', 'min:1', 'max:20'],
            'children' => ['nullable', 'integer', 'min:0', 'max:20'],
        ]);
        $adults = (int) $data['adults'];
        $children = (int) ($data['children'] ?? 0);

        return $this->ok($availability->search($data['check_in'], $data['check_out'])->map(function (array $row) use ($pricing, $data, $adults, $children) {
            $t = $row['type'];
            $fits = $adults <= $t->max_adults && $children <= $t->max_children;
            $rooms = Room::where('room_type_id', $t->id)->where('is_active', true)->where('housekeeping', '!=', 'out_of_order')->orderBy('sort_order')->orderBy('number')->get()
                ->filter(fn (Room $r) => ! RoomAvailability::overlapping($data['check_in'], $data['check_out'])->where('room_id', $r->id)->exists());

            return [
                'id' => $t->id,
                'name' => $t->name,
                'free' => $row['free'],
                'fits' => $fits,
                'free_rooms' => $rooms->map(fn (Room $r) => ['id' => $r->id, 'number' => $r->number, 'housekeeping' => $r->housekeeping])->values(),
                'quote' => $fits && $row['free'] > 0 ? $pricing->quote($t, $data['check_in'], $data['check_out'], $adults, $children) : null,
            ];
        })->values());
    }

    public function store(Request $request): JsonResponse
    {
        $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        $data = $request->validate([
            'room_type_id' => ['required', 'integer'],
            'room_id' => ['nullable', 'integer'],
            'check_in' => ['required', 'date_format:Y-m-d'],
            'check_out' => ['required', 'date_format:Y-m-d', 'after:check_in'],
            'adults' => ['required', 'integer', 'min:1', 'max:20'],
            'children' => ['nullable', 'integer', 'min:0', 'max:20'],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'source' => ['required', Rule::in(['phone', 'walk_in', 'email', 'other'])],
            'arrival_time' => ['nullable', 'date_format:H:i'],
            'requests' => ['nullable', 'string', 'max:500'],
            'staff_note' => ['nullable', 'string', 'max:500'],
            'company' => ['nullable', 'string', 'max:120'],
            'gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/'],
            'advance' => ['nullable', 'array'],
            'advance.mode' => ['required_with:advance', Rule::in(FolioPayment::MODES)],
            'advance.amount' => ['required_with:advance', 'numeric', 'min:1', 'max:10000000'],
            'advance.reference' => ['nullable', 'string', 'max:80'],
        ], ['phone.regex' => Phone::MESSAGE, 'gstin.regex' => 'Enter a valid 15-character GSTIN.']);

        $b = $this->bookings->create($this->context->require(), $data, $data['source'], $request->user())['booking'];
        if (! empty($data['advance']['amount'])) {
            $this->folio->addPayment($b, 'advance', $data['advance']['mode'], $data['advance']['amount'], $data['advance']['reference'] ?? null, $request->user());
        }

        return $this->created($this->presenter->booking($b->fresh(['type', 'room']), true), 'Booking saved.');
    }

    public function show(int $id): JsonResponse
    {
        return $this->ok($this->presenter->booking(RoomBooking::findOrFail($id), true));
    }

    /** Guest details and notes. */
    public function update(Request $request, int $id): JsonResponse
    {
        $b = RoomBooking::findOrFail($id);
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'phone' => ['sometimes', Phone::RULE],
            'email' => ['nullable', 'email:rfc', 'max:160'],
            'arrival_time' => ['nullable', 'date_format:H:i'],
            'requests' => ['nullable', 'string', 'max:500'],
            'staff_note' => ['nullable', 'string', 'max:500'],
            'company' => ['nullable', 'string', 'max:120'],
            'gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/'],
            'id_type' => ['nullable', Rule::in(RoomBooking::ID_TYPES)],
            'id_last4' => ['nullable', 'regex:/^[0-9A-Za-z]{4}$/'],
        ], ['phone.regex' => Phone::MESSAGE, 'gstin.regex' => 'Enter a valid 15-character GSTIN.', 'id_last4.regex' => 'Only the last 4 characters of the ID.']);
        foreach (['name', 'requests', 'staff_note', 'company'] as $k) {
            if (isset($data[$k])) {
                $data[$k] = strip_tags($data[$k]);
            }
        }
        if (! empty($data['gstin'])) {
            $data['gstin'] = strtoupper($data['gstin']);
        }
        $b->update($data);
        $this->bookings->emit($b);

        return $this->ok($this->presenter->booking($b->fresh(), true), 'Saved.');
    }

    public function transition(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['confirmed', 'cancelled', 'no_show'])], 'note' => ['nullable', 'string', 'max:255']]);

        return $this->ok($this->presenter->booking($this->bookings->transition(RoomBooking::findOrFail($id), $data['status'], $request->user(), $data['note'] ?? null), true));
    }

    public function assignRoom(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['room_id' => ['nullable', 'integer']]);

        return $this->ok($this->presenter->booking($this->bookings->assignRoom(RoomBooking::findOrFail($id), $data['room_id'] ?? null, $request->user()), true));
    }

    public function checkIn(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'room_id' => ['nullable', 'integer'],
            'id_type' => ['nullable', Rule::in(RoomBooking::ID_TYPES)],
            'id_last4' => ['nullable', 'regex:/^[0-9A-Za-z]{4}$/'],
            'company' => ['nullable', 'string', 'max:120'],
            'gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/'],
            'force' => ['nullable', 'boolean'],
        ], ['id_last4.regex' => 'Only the last 4 characters of the ID.', 'gstin.regex' => 'Enter a valid 15-character GSTIN.']);

        return $this->ok($this->presenter->booking($this->bookings->checkIn(RoomBooking::findOrFail($id), $data, $request->user()), true), 'Checked in.');
    }

    public function dates(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['check_in' => ['required', 'date_format:Y-m-d'], 'check_out' => ['required', 'date_format:Y-m-d', 'after:check_in']]);

        return $this->ok($this->presenter->booking($this->bookings->changeDates(RoomBooking::findOrFail($id), $data['check_in'], $data['check_out'], $request->user()), true), 'Dates changed.');
    }

    public function rate(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['price' => ['required', 'numeric', 'min:0', 'max:1000000'], 'reason' => ['required', 'string', 'min:3', 'max:200']]);

        return $this->ok($this->presenter->booking($this->bookings->setRate(RoomBooking::findOrFail($id), $data['price'], $data['reason'], $request->user()), true), 'Rate changed.');
    }

    public function checkOut(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'payments' => ['nullable', 'array', 'max:4'],
            'payments.*.mode' => ['required', Rule::in(FolioPayment::MODES)],
            'payments.*.amount' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'payments.*.reference' => ['nullable', 'string', 'max:80'],
            'charge_nights_stayed' => ['nullable', 'boolean'],
            'buyer' => ['nullable', 'array'],
            'buyer.name' => ['nullable', 'string', 'max:120'],
            'buyer.gstin' => ['nullable', 'string', 'regex:/^\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]$/'],
        ], ['buyer.gstin.regex' => 'Enter a valid 15-character GSTIN.']);
        $b = $this->bookings->checkOut(RoomBooking::findOrFail($id), $data['payments'] ?? [], (bool) ($data['charge_nights_stayed'] ?? false), $data['buyer'] ?? null, $request->user());

        return $this->ok($this->presenter->booking($b, true), 'Checked out.');
    }

    /** The stay's check-out bill as a PDF. */
    public function invoice(int $id, BillPresenter $bills): Response
    {
        $b = RoomBooking::findOrFail($id);
        $invoice = $b->invoice_id ? Invoice::find($b->invoice_id) : null;
        if (! $invoice) {
            throw new ApiException('This stay has no bill yet.', 404, 'not_found');
        }
        $tenant = $this->context->require();

        return $bills->pdf($invoice, $tenant->timezone, (bool) $tenant->is_demo)->download(str_replace('/', '-', $invoice->number).'.pdf');
    }

    public function addCharge(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'description' => ['required', 'string', 'min:2', 'max:200'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100'],
            'unit_price' => ['required', 'numeric', 'min:1', 'max:1000000'],
            'tax_rate' => ['required', 'numeric', Rule::in(Folio::EXTRA_RATES)],
        ]);
        $b = RoomBooking::findOrFail($id);
        $this->folio->addCharge($b, $data['description'], (int) $data['quantity'], $data['unit_price'], (float) $data['tax_rate'], $request->user());
        $this->bookings->emit($b);

        return $this->created($this->presenter->booking($b->fresh(), true), 'Charge added.');
    }

    public function voidCharge(Request $request, int $id, int $itemId): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:200']]);
        $b = RoomBooking::findOrFail($id);
        $this->folio->voidItem($b, FolioItem::findOrFail($itemId), $data['reason'], $request->user());
        $this->bookings->emit($b);

        return $this->ok($this->presenter->booking($b->fresh(), true), 'Charge removed.');
    }

    public function addPayment(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'kind' => ['required', Rule::in(['advance', 'payment', 'refund'])],
            'mode' => ['required', Rule::in(FolioPayment::MODES)],
            'amount' => ['required', 'numeric', 'min:1', 'max:10000000'],
            'reference' => ['nullable', 'string', 'max:80'],
        ]);
        $b = RoomBooking::findOrFail($id);
        if (in_array($b->status, ['checked_out', 'no_show'], true) && $data['kind'] !== 'refund') {
            throw new ApiException('This stay is closed. Only a refund can be recorded.', 422, 'folio_closed');
        }
        $this->folio->addPayment($b, $data['kind'], $data['mode'], $data['amount'], $data['reference'] ?? null, $request->user());
        $this->bookings->emit($b);

        return $this->created($this->presenter->booking($b->fresh(), true), $data['kind'] === 'refund' ? 'Refund recorded.' : 'Payment recorded.');
    }

    public function uploadDocument(Request $request, int $id, GuestDocuments $documents): JsonResponse
    {
        $data = $request->validate([
            'doc_type' => ['required', Rule::in(RoomBooking::ID_TYPES)],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
        ]);
        $b = RoomBooking::findOrFail($id);
        $documents->store($b, $request->file('file'), $data['doc_type'], $request->user());

        return $this->created($this->presenter->booking($b->fresh(), true), 'Document saved.');
    }

    /** The decrypted file (each view is audited). Never cached by the browser. */
    public function document(int $docId, GuestDocuments $documents): Response
    {
        $file = $documents->read(GuestDocument::findOrFail($docId));

        return response($file['content'], 200, [
            'Content-Type' => $file['mime'],
            'Content-Disposition' => 'inline; filename="guest-id"',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function deleteDocument(int $docId, GuestDocuments $documents): JsonResponse
    {
        $documents->delete(GuestDocument::findOrFail($docId));

        return $this->ok(null, 'Document deleted.');
    }

    public function banquets(Request $request): JsonResponse
    {
        $data = $request->validate(['status' => ['nullable', Rule::in(BanquetEnquiry::STATUSES)]]);
        $rows = BanquetEnquiry::when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByRaw("FIELD(status, 'new', 'contacted', 'quoted', 'booked', 'lost')")->orderByDesc('id')->limit(200)->get();

        return $this->ok($rows->map(fn (BanquetEnquiry $e) => $this->banquet($e))->values(), meta: [
            'counts' => BanquetEnquiry::selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status'),
        ]);
    }

    public function updateBanquet(Request $request, int $id): JsonResponse
    {
        $e = BanquetEnquiry::findOrFail($id);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(BanquetEnquiry::STATUSES)],
            'follow_up_on' => ['nullable', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $notes = $e->notes ?? [];
        if (! empty($data['note'])) {
            $notes[] = ['at' => now()->toIso8601String(), 'by' => $request->user()->name, 'text' => strip_tags($data['note'])];
        }
        if (isset($data['status']) && $data['status'] !== $e->status) {
            $notes[] = ['at' => now()->toIso8601String(), 'by' => $request->user()->name, 'text' => null, 'status' => $data['status']];
        }
        $e->update(array_filter([
            'status' => $data['status'] ?? null,
            'notes' => $notes,
        ], fn ($v) => $v !== null) + (array_key_exists('follow_up_on', $data) ? ['follow_up_on' => $data['follow_up_on']] : []));

        return $this->ok($this->banquet($e->fresh()), 'Saved.');
    }

    private function banquet(BanquetEnquiry $e): array
    {
        return [
            'id' => $e->id, 'name' => $e->name, 'phone' => $e->phone, 'email' => $e->email, 'event_type' => $e->event_type,
            'event_date' => $e->event_date?->format('Y-m-d'), 'guests' => $e->guests, 'message' => $e->message, 'status' => $e->status,
            'follow_up_on' => $e->follow_up_on?->format('Y-m-d'), 'notes' => $e->notes ?? [], 'created_at' => $e->created_at->toIso8601String(),
        ];
    }
}
