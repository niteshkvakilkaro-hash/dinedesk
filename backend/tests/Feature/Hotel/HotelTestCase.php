<?php

namespace Tests\Feature\Hotel;

use App\Models\User;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomRate;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Plans\Models\Plan;
use Illuminate\Support\Str;
use Tests\Feature\Operations\OperationsTestCase;

/**
 * A Pro-plan hotel with a restaurant (Tuesday 10 Nov 2026, 1 pm IST):
 *  - Deluxe ₹3,000 a night, ₹3,600 on Friday / Saturday, 2 adults included (+₹800 for a 3rd), up to 2 children;
 *    "Wedding season" 20–22 Nov at ₹4,500. Rooms 101 and 102.
 *  - Suite ₹8,000 (18% GST slab), 2 adults, no children. Room 201.
 */
abstract class HotelTestCase extends OperationsTestCase
{
    protected User $desk;

    protected RoomType $deluxe;

    protected RoomType $suite;

    /** @var array<string, Room> */
    protected array $rooms = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant->update(['plan_id' => Plan::where('code', 'pro')->value('id')]);
        $this->asTenant(function () {
            app(HotelSettings::class)->save(array_replace(HotelSettings::defaults(), ['online_booking' => true, 'room_service' => true, 'banquets' => true]));
            $this->deluxe = RoomType::create(['slug' => 'deluxe', 'name' => 'Deluxe', 'base_occupancy' => 2, 'max_adults' => 3, 'max_children' => 2, 'base_price' => 3000, 'weekend_price' => 3600, 'extra_adult_price' => 800, 'amenities' => ['ac', 'wifi']]);
            $this->suite = RoomType::create(['slug' => 'suite', 'name' => 'Suite', 'base_occupancy' => 2, 'max_adults' => 2, 'max_children' => 0, 'base_price' => 8000]);
            RoomRate::create(['room_type_id' => $this->deluxe->id, 'name' => 'Wedding season', 'starts_on' => '2026-11-20', 'ends_on' => '2026-11-22', 'price' => 4500]);
            foreach ([['101', $this->deluxe], ['102', $this->deluxe], ['201', $this->suite]] as [$n, $t]) {
                $this->rooms[$n] = Room::create(['room_type_id' => $t->id, 'number' => $n, 'qr_token' => Str::random(32)]);
            }
        });
        $this->desk = $this->staff($this->tenant, 'front_desk');
    }

    protected function guestBooking(array $overrides = []): array
    {
        return $overrides + [
            'room_type_id' => $this->deluxe->id,
            'check_in' => '2026-11-12',
            'check_out' => '2026-11-14',
            'adults' => 2,
            'children' => 0,
            'name' => 'Asha Verma',
            'phone' => '98765 43210',
            'email' => 'asha@example.com',
        ];
    }

    /** A front-desk booking (confirmed at once). */
    protected function deskBooking(array $overrides = []): array
    {
        return $this->actingAsUser($this->desk)->postJson('/api/v1/tenant/hotel/bookings', $overrides + [
            'room_type_id' => $this->deluxe->id,
            'check_in' => '2026-11-10',
            'check_out' => '2026-11-12',
            'adults' => 2,
            'name' => 'Rohan Mehta',
            'phone' => '9876543210',
            'source' => 'walk_in',
        ])->assertCreated()->json('data');
    }
}
