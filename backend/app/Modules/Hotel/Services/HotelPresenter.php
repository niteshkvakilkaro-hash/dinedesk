<?php

namespace App\Modules\Hotel\Services;

use App\Modules\Hotel\Models\GuestDocument;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomRate;
use App\Modules\Hotel\Models\RoomType;
use App\Support\Images\ImageService;

class HotelPresenter
{
    public function __construct(
        private readonly ImageService $images,
        private readonly Folio $folio,
        private readonly HotelSettings $settings,
    ) {}

    public function type(RoomType $t, bool $staff = false): array
    {
        $out = [
            'id' => $t->id,
            'slug' => $t->slug,
            'name' => $t->name,
            'name_hi' => $t->name_hi,
            'description' => $t->description,
            'description_hi' => $t->description_hi,
            'photos' => collect($t->photos ?? [])->map(fn ($p, $i) => ['key' => $i, 'alt' => $p['alt'] ?? $t->name] + ($this->images->present($p['image'] ?? null) ?? []))->filter(fn ($p) => isset($p['src']))->values(),
            'amenities' => array_values($t->amenities ?? []),
            'bed' => $t->bed,
            'size_sqft' => $t->size_sqft,
            'base_occupancy' => $t->base_occupancy,
            'max_adults' => $t->max_adults,
            'max_children' => $t->max_children,
            'base_price' => $t->base_price,
            'weekend_price' => $t->weekend_price,
            'extra_adult_price' => $t->extra_adult_price,
            'extra_child_price' => $t->extra_child_price,
            'from_price' => RoomPricing::fromPrice($t),
        ];
        if ($staff) {
            $out += [
                'is_active' => $t->is_active,
                'sort_order' => $t->sort_order,
                'rooms_count' => $t->rooms_count ?? $t->rooms()->count(),
                'rates' => $t->rates->map(fn (RoomRate $r) => ['id' => $r->id, 'name' => $r->name, 'starts_on' => $r->starts_on->format('Y-m-d'), 'ends_on' => $r->ends_on->format('Y-m-d'), 'price' => $r->price, 'weekend_price' => $r->weekend_price])->values(),
            ];
        }

        return $out;
    }

    public function room(Room $r, ?string $siteBase = null): array
    {
        return [
            'id' => $r->id,
            'number' => $r->number,
            'floor' => $r->floor,
            'room_type_id' => $r->room_type_id,
            'type' => $r->type?->name,
            'housekeeping' => $r->housekeeping,
            'housekeeping_note' => $r->housekeeping_note,
            'is_active' => $r->is_active,
            'sort_order' => $r->sort_order,
        ] + ($siteBase ? ['qr_token' => $r->qr_token, 'qr_url' => "{$siteBase}/r/{$r->qr_token}"] : []);
    }

    /** What the front desk sees. */
    public function booking(RoomBooking $b, bool $detail = false): array
    {
        $b->loadMissing(['type', 'room']);
        $out = [
            'id' => $b->id,
            'public_id' => $b->public_id,
            'code' => $b->code,
            'status' => $b->status,
            'source' => $b->source,
            'name' => $b->name,
            'phone' => $b->phone,
            'email' => $b->email,
            'adults' => $b->adults,
            'children' => $b->children,
            'check_in' => $b->check_in->format('Y-m-d'),
            'check_out' => $b->check_out->format('Y-m-d'),
            'nights' => $b->nights,
            'room_type' => ['id' => $b->type->id, 'name' => $b->type->name],
            'room' => $b->room ? ['id' => $b->room->id, 'number' => $b->room->number, 'housekeeping' => $b->room->housekeeping] : null,
            'total' => $b->total,
            'advance_due' => $b->advance_due,
            'awaiting_payment' => (bool) $b->hold_expires_at,
            'arrival_time' => $b->arrival_time,
            'requests' => $b->requests,
            'created_at' => $b->created_at->toIso8601String(),
        ];
        if ($detail) {
            $out += [
                'rates' => $b->rates,
                'room_total' => $b->room_total,
                'tax_total' => $b->tax_total,
                'staff_note' => $b->staff_note,
                'company' => $b->company,
                'gstin' => $b->gstin,
                'id_type' => $b->id_type,
                'id_last4' => $b->id_last4,
                'confirmed_at' => $b->confirmed_at?->toIso8601String(),
                'checked_in_at' => $b->checked_in_at?->toIso8601String(),
                'checked_out_at' => $b->checked_out_at?->toIso8601String(),
                'cancelled_by' => $b->cancelled_by,
                'cancel_reason' => $b->cancel_reason,
                'invoice' => $b->invoice_id ? ['id' => $b->invoice_id, 'number' => $b->invoice?->number] : null,
                'folio' => $this->folio->present($b),
                'orders' => $b->orders()->get(['id', 'number', 'status', 'total', 'placed_at'])->map(fn ($o) => ['id' => $o->id, 'number' => $o->number, 'status' => $o->status, 'total' => $o->total, 'placed_at' => $o->placed_at->toIso8601String()])->values(),
                'documents' => $this->settings->get()['id_documents']
                    ? GuestDocument::where('room_booking_id', $b->id)->orderBy('id')->get()->map(fn (GuestDocument $d) => ['id' => $d->id, 'doc_type' => $d->doc_type, 'size' => $d->size, 'delete_after' => $d->delete_after->format('Y-m-d'), 'created_at' => $d->created_at->toIso8601String()])->values()
                    : null,
            ];
        }

        return $out;
    }

    /** What the guest sees with their private link (no staff notes, no ID details). */
    public function forGuest(RoomBooking $b, bool $canCancel): array
    {
        $b->loadMissing('type');
        $s = $this->folio->summary($b);

        return [
            'id' => $b->public_id,
            'code' => $b->code,
            'status' => $b->status,
            'name' => $b->name,
            'room_type' => ['name' => $b->type->name, 'name_hi' => $b->type->name_hi],
            'check_in' => $b->check_in->format('Y-m-d'),
            'check_out' => $b->check_out->format('Y-m-d'),
            'nights' => $b->nights,
            'adults' => $b->adults,
            'children' => $b->children,
            'rates' => array_map(fn ($r) => ['date' => $r['date'], 'price' => $r['price'], 'tax' => $r['tax']], $b->rates),
            'room_total' => $b->room_total,
            'tax_total' => $b->tax_total,
            'total' => $b->total,
            'advance_due' => $b->advance_due,
            'paid' => $s['paid'],
            'awaiting_payment' => (bool) $b->hold_expires_at,
            'hold_expires_at' => $b->hold_expires_at?->toIso8601String(),
            'can_cancel' => $canCancel,
            'cancelled_by' => $b->cancelled_by,
            'requests' => $b->requests,
        ];
    }
}
