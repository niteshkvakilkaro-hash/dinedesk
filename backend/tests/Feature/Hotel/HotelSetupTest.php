<?php

namespace Tests\Feature\Hotel;

use App\Modules\Hotel\Models\Room;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/** Room types with photos, rooms in bulk, QR codes, and who may set them up. */
class HotelSetupTest extends HotelTestCase
{
    public function test_owner_sets_up_room_types_photos_rooms_and_qr_codes(): void
    {
        Storage::fake('public');
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($this->desk)->getJson('/api/v1/tenant/hotel/types')->assertForbidden();

        $type = $this->actingAsUser($owner)->postJson('/api/v1/tenant/hotel/types', [
            'name' => 'Family Room', 'description' => '<b>Two</b> double beds', 'amenities' => ['ac', 'wifi', 'tv'], 'base_occupancy' => 2, 'max_adults' => 4, 'max_children' => 2,
            'base_price' => 4200, 'weekend_price' => 4800, 'extra_adult_price' => 700, 'is_active' => true,
        ])->assertCreated()->assertJsonPath('data.slug', 'family-room')->assertJsonPath('data.description', 'Two double beds')->json('data');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/hotel/types', ['name' => 'X', 'base_occupancy' => 3, 'max_adults' => 2, 'max_children' => 0, 'base_price' => 100, 'is_active' => true, 'amenities' => ['jacuzzi']])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'base_occupancy', 'amenities.0']);

        $this->actingAsUser($owner)->post("/api/v1/tenant/hotel/types/{$type['id']}/photos", ['image' => UploadedFile::fake()->image('room.jpg', 1200, 800), 'alt' => 'Family room with two beds'], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.photos.0.alt', 'Family room with two beds');
        $this->actingAsUser($owner)->post("/api/v1/tenant/hotel/types/{$type['id']}/photos", ['image' => UploadedFile::fake()->image('bath.jpg', 1200, 800)], ['Accept' => 'application/json'])->assertCreated();
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/hotel/types/{$type['id']}/photos/1")->assertOk()->assertJsonPath('data.photos.0.alt', 'Family Room');
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/hotel/types/{$type['id']}/photos/0")->assertOk()->assertJsonCount(1, 'data.photos');

        // Rooms in one go; numbers stay unique.
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/hotel/rooms', ['room_type_id' => $type['id'], 'numbers' => '301-303, 3A', 'floor' => '3'])->assertCreated()->assertJsonCount(7, 'data');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/hotel/rooms', ['room_type_id' => $type['id'], 'numbers' => '303'])->assertStatus(422)->assertJsonPath('meta.code', 'duplicate');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/hotel/rooms', ['room_type_id' => $type['id'], 'numbers' => '<b>1</b>'])->assertStatus(422)->assertJsonPath('meta.code', 'invalid_number');

        $room = $this->asTenant(fn () => Room::where('number', '301')->first());
        $new = $this->actingAsUser($owner)->postJson("/api/v1/tenant/hotel/rooms/{$room->id}/qr")->assertOk()->json('data.qr_token');
        $this->assertNotSame($room->qr_token, $new);
        $this->getJson("/api/v1/site/hotel/rooms/{$room->qr_token}", $this->site())->assertNotFound();
        $this->getJson("/api/v1/site/hotel/rooms/{$new}", $this->site())->assertOk()->assertJsonPath('data.number', '301')->assertJsonPath('data.occupied', false);

        // A type or room with bookings can't be removed.
        $this->deskBooking(['room_id' => $this->rooms['101']->id]);
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/hotel/types/{$this->deluxe->id}")->assertStatus(422)->assertJsonPath('meta.code', 'in_use');
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/hotel/rooms/{$this->rooms['101']->id}")->assertStatus(422)->assertJsonPath('meta.code', 'in_use');
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/hotel/types/{$type['id']}")->assertOk();
        $this->getJson('/api/v1/site/hotel', $this->site())->assertJsonCount(2, 'data.types');

        // The site shows the hotel pages.
        $this->getJson('/api/v1/site', $this->site())->assertOk()->assertJsonPath('data.features.hotel', true)->assertJsonPath('data.hotel.has_rooms', true)->assertJsonPath('data.hotel.room_service', true);
    }
}
