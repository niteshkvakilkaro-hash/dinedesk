<?php

namespace App\Modules\Hotel\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Models\RoomRate;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Services\HotelPresenter;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use App\Support\ApiException;
use App\Support\Images\ImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Dashboard → Hotel → Set up: room types (photos, prices), seasonal rates, rooms and their QR codes, settings. */
class HotelSetupController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly HotelPresenter $presenter,
        private readonly ImageService $images,
    ) {}

    public function types(): JsonResponse
    {
        $types = RoomType::with('rates')->withCount('rooms')->orderBy('sort_order')->orderBy('id')->get();

        return $this->ok($types->map(fn (RoomType $t) => $this->presenter->type($t, true))->values());
    }

    public function storeType(Request $request): JsonResponse
    {
        $data = $request->validate($this->typeRules());
        $slug = Str::slug($data['name']) ?: 'room';
        $base = $slug;
        for ($i = 2; RoomType::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }
        $type = RoomType::create($this->clean($data) + ['slug' => $slug, 'sort_order' => (int) RoomType::max('sort_order') + 1]);
        AuditLog::record('room_type.created', $type, ['name' => $type->name, 'price' => $type->base_price]);

        return $this->created($this->presenter->type($type->load('rates')->loadCount('rooms'), true), 'Room type added.');
    }

    public function updateType(Request $request, int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $data = $request->validate($this->typeRules());
        $before = ['base_price' => $type->base_price, 'weekend_price' => $type->weekend_price];
        $type->update($this->clean($data));
        if ($before['base_price'] !== $type->base_price || $before['weekend_price'] !== $type->weekend_price) {
            AuditLog::record('room_type.price_changed', $type, ['name' => $type->name, 'from' => $before, 'to' => ['base_price' => $type->base_price, 'weekend_price' => $type->weekend_price]]);
        }

        return $this->ok($this->presenter->type($type->load('rates')->loadCount('rooms'), true), 'Saved.');
    }

    public function destroyType(int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        if (RoomBooking::where('room_type_id', $id)->whereIn('status', RoomBooking::HOLDING)->exists()) {
            throw new ApiException('This room type has bookings. Switch it off instead (it stops being sold).', 422, 'in_use');
        }
        $type->rooms()->get()->each->delete();
        $type->delete();
        AuditLog::record('room_type.deleted', $type, ['name' => $type->name]);

        return $this->ok(null, 'Room type removed.');
    }

    public function addPhoto(Request $request, int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $data = $request->validate(['image' => ImageService::rules(), 'alt' => ['nullable', 'string', 'max:150']]);
        $photos = $type->photos ?? [];
        if (count($photos) >= RoomType::MAX_PHOTOS) {
            throw new ApiException('Up to '.RoomType::MAX_PHOTOS.' photos per room type.', 422, 'too_many');
        }
        $photos[] = ['image' => $this->images->store($request->file('image'), $this->context->require(), 'rooms'), 'alt' => isset($data['alt']) ? strip_tags($data['alt']) : $type->name];
        $type->update(['photos' => $photos]);

        return $this->created($this->presenter->type($type->load('rates')->loadCount('rooms'), true), 'Photo added.');
    }

    /** Remove a photo, or move it to the front (the cover). */
    public function photo(Request $request, int $id, int $key): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $photos = $type->photos ?? [];
        if (! isset($photos[$key])) {
            throw new ApiException('Photo not found.', 404, 'not_found');
        }
        if ($request->isMethod('delete')) {
            $this->images->delete($photos[$key]['image'] ?? null);
            unset($photos[$key]);
        } else {
            $first = $photos[$key];
            unset($photos[$key]);
            array_unshift($photos, $first);
        }
        $type->update(['photos' => array_values($photos)]);

        return $this->ok($this->presenter->type($type->load('rates')->loadCount('rooms'), true));
    }

    public function storeRate(Request $request, int $id): JsonResponse
    {
        $type = RoomType::findOrFail($id);
        $data = $request->validate($this->rateRules());
        RoomRate::create($data + ['room_type_id' => $type->id, 'name' => strip_tags($data['name'])]);
        AuditLog::record('room_rate.created', $type, $data);

        return $this->created($this->presenter->type($type->load('rates')->loadCount('rooms'), true), 'Seasonal price added.');
    }

    public function updateRate(Request $request, int $rateId): JsonResponse
    {
        $rate = RoomRate::findOrFail($rateId);
        $data = $request->validate($this->rateRules());
        $rate->update(['name' => strip_tags($data['name'])] + $data);
        AuditLog::record('room_rate.updated', $rate, $data);
        $type = RoomType::findOrFail($rate->room_type_id);

        return $this->ok($this->presenter->type($type->load('rates')->loadCount('rooms'), true), 'Saved.');
    }

    public function destroyRate(int $rateId): JsonResponse
    {
        $rate = RoomRate::findOrFail($rateId);
        $rate->delete();
        AuditLog::record('room_rate.deleted', $rate, ['name' => $rate->name]);
        $type = RoomType::findOrFail($rate->room_type_id);

        return $this->ok($this->presenter->type($type->load('rates')->loadCount('rooms'), true));
    }

    public function rooms(): JsonResponse
    {
        $rooms = Room::with('type')->orderBy('sort_order')->orderBy('number')->get();

        return $this->ok($rooms->map(fn (Room $r) => $this->presenter->room($r, $this->siteBase()))->values());
    }

    /** Add one room or several at once ("101-110, 201"). */
    public function storeRooms(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room_type_id' => ['required', 'integer', Rule::exists('room_types', 'id')->where('tenant_id', $this->context->id())->whereNull('deleted_at')],
            'numbers' => ['required', 'string', 'max:300'],
            'floor' => ['nullable', 'string', 'max:20'],
        ]);
        $numbers = $this->expand($data['numbers']);
        $taken = Room::withTrashed()->whereIn('number', $numbers)->pluck('number');
        if ($taken->isNotEmpty()) {
            throw new ApiException('Room '.$taken->implode(', ').' already exists.', 422, 'duplicate', ['field' => 'numbers']);
        }
        $order = (int) Room::max('sort_order');
        foreach ($numbers as $n) {
            Room::create(['room_type_id' => $data['room_type_id'], 'number' => $n, 'floor' => $data['floor'] ?? null, 'qr_token' => Str::random(32), 'sort_order' => ++$order]);
        }
        AuditLog::record('rooms.created', null, ['numbers' => $numbers]);

        return $this->rooms()->setStatusCode(201);
    }

    public function updateRoom(Request $request, int $id): JsonResponse
    {
        $room = Room::findOrFail($id);
        $data = $request->validate([
            'number' => ['required', 'string', 'max:20', Rule::unique('rooms', 'number')->where('tenant_id', $this->context->id())->ignore($room->id)],
            'room_type_id' => ['required', 'integer', Rule::exists('room_types', 'id')->where('tenant_id', $this->context->id())->whereNull('deleted_at')],
            'floor' => ['nullable', 'string', 'max:20'],
            'is_active' => ['required', 'boolean'],
        ]);
        $busy = RoomBooking::where('room_id', $room->id)->whereIn('status', RoomBooking::HOLDING);
        if ((int) $data['room_type_id'] !== $room->room_type_id && (clone $busy)->exists()) {
            throw new ApiException("Room {$room->number} has bookings. Move them to another room before changing its type.", 422, 'in_use');
        }
        if (! $data['is_active'] && (clone $busy)->exists()) {
            throw new ApiException("Room {$room->number} has bookings. Move them first.", 422, 'in_use');
        }
        $room->update(['number' => strip_tags($data['number'])] + $data);

        return $this->ok($this->presenter->room($room->fresh('type'), $this->siteBase()), 'Saved.');
    }

    public function destroyRoom(int $id): JsonResponse
    {
        $room = Room::findOrFail($id);
        if (RoomBooking::where('room_id', $room->id)->whereIn('status', RoomBooking::HOLDING)->exists()) {
            throw new ApiException("Room {$room->number} has bookings. Move them first.", 422, 'in_use');
        }
        $room->delete();
        AuditLog::record('room.deleted', $room, ['number' => $room->number]);

        return $this->ok(null, 'Room removed.');
    }

    /** A new QR code (the old printed one stops working). */
    public function regenerateQr(int $id): JsonResponse
    {
        $room = Room::findOrFail($id);
        $room->update(['qr_token' => Str::random(32)]);
        AuditLog::record('room.qr_regenerated', $room, ['number' => $room->number]);

        return $this->ok($this->presenter->room($room->fresh('type'), $this->siteBase()), 'New QR code made. Print it again.');
    }

    public function settings(HotelSettings $settings): JsonResponse
    {
        return $this->ok($settings->get());
    }

    public function updateSettings(Request $request, HotelSettings $settings): JsonResponse
    {
        $data = $request->validate(HotelSettings::rules());
        $before = $settings->get();
        $saved = $settings->save($data);
        if ($before['id_documents'] !== $saved['id_documents']) {
            AuditLog::record($saved['id_documents'] ? 'guest_id.storage_on' : 'guest_id.storage_off', null, ['keep_days' => $saved['id_keep_days']]);
        }

        return $this->ok($saved, 'Saved.');
    }

    private function siteBase(): string
    {
        return rtrim(str_replace('{host}', app(SitePresenter::class)->primaryHost($this->context->require()), (string) config('dinedesk.site_url_pattern')), '/');
    }

    private function typeRules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:80'],
            'name_hi' => ['nullable', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:1500'],
            'description_hi' => ['nullable', 'string', 'max:1500'],
            'amenities' => ['nullable', 'array'],
            'amenities.*' => [Rule::in(RoomType::AMENITIES)],
            'bed' => ['nullable', 'string', 'max:60'],
            'size_sqft' => ['nullable', 'integer', 'min:50', 'max:20000'],
            'base_occupancy' => ['required', 'integer', 'min:1', 'max:20', 'lte:max_adults'],
            'max_adults' => ['required', 'integer', 'min:1', 'max:20'],
            'max_children' => ['required', 'integer', 'min:0', 'max:20'],
            'base_price' => ['required', 'numeric', 'min:1', 'max:1000000'],
            'weekend_price' => ['nullable', 'numeric', 'min:1', 'max:1000000'],
            'extra_adult_price' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'extra_child_price' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    private function rateRules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:60'],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            'price' => ['required', 'numeric', 'min:1', 'max:1000000'],
            'weekend_price' => ['nullable', 'numeric', 'min:1', 'max:1000000'],
        ];
    }

    private function clean(array $data): array
    {
        foreach (['name', 'name_hi', 'description', 'description_hi', 'bed'] as $k) {
            if (array_key_exists($k, $data)) {
                $data[$k] = $data[$k] !== null ? trim(strip_tags($data[$k])) : null;
            }
        }
        $data['amenities'] = array_values(array_unique($data['amenities'] ?? []));
        $data['extra_adult_price'] ??= 0;
        $data['extra_child_price'] ??= 0;

        return $data;
    }

    /** "101-103, 201" → [101, 102, 103, 201] (at most 200 rooms at once). */
    private function expand(string $input): array
    {
        $out = [];
        foreach (preg_split('/[\s,]+/', trim($input), -1, PREG_SPLIT_NO_EMPTY) as $part) {
            if (preg_match('/^(\d{1,5})-(\d{1,5})$/', $part, $m) && (int) $m[1] <= (int) $m[2]) {
                for ($n = (int) $m[1]; $n <= (int) $m[2]; $n++) {
                    $out[] = (string) $n;
                    if (count($out) > 200) {
                        break 2;
                    }
                }
            } elseif (preg_match('/^[0-9A-Za-z][0-9A-Za-z\-\/]{0,19}$/', $part)) {
                $out[] = strtoupper($part);
            } else {
                throw new ApiException("\"{$part}\" is not a room number.", 422, 'invalid_number', ['field' => 'numbers']);
            }
        }
        $out = array_values(array_unique($out));
        if (! $out || count($out) > 200) {
            throw new ApiException('Enter between 1 and 200 room numbers.', 422, 'invalid_number', ['field' => 'numbers']);
        }

        return $out;
    }
}
