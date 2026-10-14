<?php

namespace Tests\Feature\Hotel;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Hotel\Models\FolioItem;
use App\Modules\Hotel\Models\GuestDocument;
use App\Modules\Hotel\Models\Room;
use App\Modules\Ordering\Models\Order;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/** Check-in, the folio (room nights, room service, extras, payments), check-out bill, housekeeping, IDs, events. */
class FrontDeskTest extends HotelTestCase
{
    public function test_a_stay_from_check_in_through_room_service_to_the_check_out_bill(): void
    {
        $owner = $this->ownerOf($this->tenant);
        // Walk-in for Tue + Wed nights in room 101, ₹1,000 cash advance.
        $stay = $this->deskBooking(['room_id' => $this->rooms['101']->id, 'advance' => ['mode' => 'cash', 'amount' => 1000]]);
        $this->assertSame(['confirmed', '6300.00', '1000.00', '5300.00'], [$stay['status'], $stay['total'], $stay['folio']['summary']['paid'], $stay['folio']['summary']['balance']]);
        $id = $stay['id'];

        $this->actingAsUser($this->desk)->getJson('/api/v1/tenant/hotel/today')->assertOk()->assertJsonCount(1, 'data.arrivals')->assertJsonPath('data.stats.rooms', 3);
        $in = $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-in", ['id_type' => 'aadhaar', 'id_last4' => '1234'])
            ->assertOk()->assertJsonPath('data.status', 'checked_in')->json('data');
        $this->assertSame(2, collect($in['folio']['items'])->where('type', 'room')->count());

        // Room service from the room's QR: only with the last 4 digits of the guest's mobile.
        $token = $this->asTenant(fn () => Room::find($this->rooms['101']->id)->qr_token);
        $order = fn ($pin) => $this->postJson('/api/v1/site/orders', [
            'type' => 'room_service', 'payment_method' => 'room', 'room_token' => $token, 'room_pin' => $pin,
            'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 2]],
        ], $this->site());
        $order('0000')->assertStatus(422)->assertJsonPath('meta.code', 'room_verify');
        $placed = $order('3210')->assertCreated()->assertJsonPath('data.order.total', '126.00')->json('data.order');
        $o = Order::withoutTenancy()->where('public_id', $placed['id'])->first();
        $this->assertSame(['room_service', 'room', 'Room 101', 'Rohan Mehta'], [$o->type, $o->payment_method, $o->table_label, $o->customer_name]);
        // An empty room can't be ordered to; room service can't be billed at the POS.
        $empty = $this->asTenant(fn () => Room::find($this->rooms['102']->id)->qr_token);
        $this->postJson('/api/v1/site/orders', ['type' => 'room_service', 'payment_method' => 'room', 'room_token' => $empty, 'room_pin' => '3210', 'items' => [['item_id' => $this->items['naan']->id, 'quantity' => 1]]], $this->site())
            ->assertStatus(422)->assertJsonPath('meta.code', 'no_guest');
        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/bills', ['order_ids' => [$o->id]])->assertStatus(422)->assertJsonPath('meta.code', 'room_order');
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/pos/open')->assertJsonCount(0, 'data.orders');

        // Laundry ₹200 at 18%.
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/charges", ['description' => 'Laundry', 'quantity' => 1, 'unit_price' => 200, 'tax_rate' => 18])
            ->assertCreated()->assertJsonPath('data.folio.summary.total', '6662.00')->assertJsonPath('data.folio.summary.balance', '5662.00');
        $room = collect($in['folio']['items'])->firstWhere('type', 'room')['id'];
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/charges/{$room}/void", ['reason' => 'test'])->assertStatus(422)->assertJsonPath('meta.code', 'not_removable');

        // Can't leave with the order still in the kitchen, or with money due.
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-out")->assertStatus(422)->assertJsonPath('meta.code', 'orders_open');
        foreach (['confirmed', 'preparing', 'ready', 'completed'] as $status) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$o->id}/status", ['status' => $status])->assertOk();
        }
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-out", ['payments' => [['mode' => 'upi', 'amount' => 5000]]])
            ->assertStatus(422)->assertJsonPath('meta.code', 'balance_due');
        $out = $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-out", ['payments' => [['mode' => 'cash', 'amount' => 5662]]])
            ->assertOk()->assertJsonPath('data.status', 'checked_out')->json('data');

        // The bill: room nights (SAC 996311) as one line, the dishes, the laundry. GST 171 + 171.
        $inv = Invoice::withoutTenancy()->with('lines')->find($out['invoice']['id']);
        $this->assertSame(['6662.00', '6662.00', 'paid', '171.00', '171.00', 'bill'], [$inv->total, $inv->paid, $inv->status, $inv->cgst, $inv->sgst, $inv->kind]);
        $this->assertSame(['996311', '996331', '999799'], $inv->lines->pluck('sac')->all());
        $this->assertSame(2, $inv->lines->first()->quantity);
        $this->assertSame(['paid', 'dirty'], [$o->fresh()->payment_status, $this->rooms['101']->fresh()->housekeeping]);

        // Day-end: the hotel money is counted once, on the day it came in.
        $r = $this->actingAsUser($owner)->getJson('/api/v1/tenant/reports/day?date=2026-11-10')->assertOk();
        $r->assertJsonPath('data.hotel.net', '6662.00')->assertJsonPath('data.cash.hotel', '6662.00')->assertJsonPath('data.cash.expected', '6662.00')->assertJsonPath('data.bills.total', '6662.00');
        $this->assertNull(collect($r->json('data.payments'))->firstWhere('mode', 'folio'));
        // The front desk downloads the bill (with the stay and the payments as they came in).
        $this->actingAsUser($this->desk)->get("/api/v1/tenant/hotel/bookings/{$id}/invoice")->assertOk()->assertHeader('content-type', 'application/pdf');

        // Reports: 2 of 6 room-nights sold over two days.
        $h = $this->actingAsUser($owner)->getJson('/api/v1/tenant/reports/overview?from=2026-11-10&to=2026-11-11')->assertOk()->json('data.hotel');
        $this->assertSame([3, 6, 2, 33.3, '6000.00', '3000.00', '1000.00'], [$h['rooms'], $h['nights_available'], $h['nights_sold'], $h['occupancy'], $h['room_revenue'], $h['adr'], $h['revpar']]);
        $csv = $this->actingAsUser($owner)->get('/api/v1/tenant/reports/export/stays?from=2026-11-10&to=2026-11-11')->assertOk()->streamedContent();
        $this->assertStringContainsString($stay['code'], $csv);
        $this->assertStringContainsString($inv->number, $csv);
    }

    public function test_dates_rates_and_an_early_departure(): void
    {
        $stay = $this->deskBooking(['check_out' => '2026-11-13', 'room_id' => $this->rooms['102']->id]);
        $id = $stay['id'];
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-in")->assertOk();
        // One more night (Friday) → 3,000 × 3 + 3,600.
        $this->actingAsUser($this->desk)->putJson("/api/v1/tenant/hotel/bookings/{$id}/dates", ['check_in' => '2026-11-10', 'check_out' => '2026-11-14'])
            ->assertOk()->assertJsonPath('data.room_total', '12600.00')->assertJsonPath('data.nights', 4);
        // A rate agreed with the guest (audited).
        $this->actingAsUser($this->desk)->putJson("/api/v1/tenant/hotel/bookings/{$id}/rate", ['price' => 2500, 'reason' => 'Corporate rate'])
            ->assertOk()->assertJsonPath('data.total', '10500.00')->assertJsonPath('data.folio.summary.total', '10500.00');
        $this->assertTrue(AuditLog::query()->where('action', 'stay.rate_changed')->exists());

        // Leaves the next morning: only the first night is charged.
        $this->travelTo(CarbonImmutable::parse('2026-11-11 10:00', 'Asia/Kolkata'));
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-out", ['charge_nights_stayed' => true, 'payments' => [['mode' => 'card', 'amount' => 2625]]])
            ->assertOk()->assertJsonPath('data.check_out', '2026-11-11')->assertJsonPath('data.folio.summary.total', '2625.00');
        $this->assertSame(3, FolioItem::withoutTenancy()->where('room_booking_id', $id)->whereNotNull('voided_at')->where('type', 'room')->where('void_reason', 'Stay dates changed')->count());
    }

    public function test_housekeeping_board_room_states_and_who_can_change_them(): void
    {
        $hk = $this->staff($this->tenant, 'housekeeping');
        $this->actingAsUser($hk)->getJson('/api/v1/tenant/hotel/housekeeping')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAsUser($hk)->getJson('/api/v1/tenant/hotel/today')->assertForbidden();
        $this->actingAsUser($hk)->getJson('/api/v1/tenant/hotel/types')->assertForbidden();

        $r102 = $this->rooms['102']->id;
        $this->actingAsUser($hk)->postJson("/api/v1/tenant/hotel/rooms/{$r102}/housekeeping", ['status' => 'out_of_order'])->assertStatus(422)->assertJsonPath('meta.code', 'reason_required');
        $this->actingAsUser($hk)->postJson("/api/v1/tenant/hotel/rooms/{$r102}/housekeeping", ['status' => 'out_of_order', 'note' => 'AC leaking'])->assertOk();
        // An out-of-order room is not sold.
        $res = $this->getJson('/api/v1/site/hotel/availability?check_in=2026-11-12&check_out=2026-11-13&adults=2', $this->site());
        $this->assertSame(1, collect($res->json('data.types'))->firstWhere('id', $this->deluxe->id)['few_left']);
        $this->actingAsUser($hk)->getJson("/api/v1/tenant/hotel/rooms/{$r102}/housekeeping")->assertOk()->assertJsonPath('data.0.to', 'out_of_order')->assertJsonPath('data.0.by', $hk->name);

        // A dirty room needs the desk to confirm before checking a guest in.
        $this->actingAsUser($hk)->postJson("/api/v1/tenant/hotel/rooms/{$this->rooms['101']->id}/housekeeping", ['status' => 'dirty'])->assertOk();
        $id = $this->deskBooking(['room_id' => $this->rooms['101']->id])['id'];
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-in")->assertStatus(422)->assertJsonPath('meta.code', 'room_not_ready');
        $this->actingAsUser($this->desk)->postJson("/api/v1/tenant/hotel/bookings/{$id}/check-in", ['force' => true])->assertOk();
        $this->actingAsUser($hk)->postJson("/api/v1/tenant/hotel/rooms/{$this->rooms['101']->id}/housekeeping", ['status' => 'out_of_order', 'note' => 'x'])->assertStatus(422)->assertJsonPath('meta.code', 'room_occupied');
        $this->actingAsUser($hk)->getJson('/api/v1/tenant/hotel/housekeeping')->assertJsonPath('data.0.occupied', true);
    }

    public function test_guest_ids_are_off_by_default_then_encrypted_logged_and_deleted_on_time(): void
    {
        Storage::fake('local');
        $owner = $this->ownerOf($this->tenant);
        $id = $this->deskBooking()['id'];
        $file = UploadedFile::fake()->image('aadhaar.jpg', 600, 400);
        $this->actingAsUser($this->desk)->post("/api/v1/tenant/hotel/bookings/{$id}/documents", ['doc_type' => 'aadhaar', 'file' => $file], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'documents_off');

        $settings = $this->actingAsUser($owner)->getJson('/api/v1/tenant/hotel/settings')->json('data');
        $this->actingAsUser($owner)->putJson('/api/v1/tenant/hotel/settings', array_replace($settings, ['id_documents' => true, 'id_keep_days' => 7]))->assertOk();
        $this->actingAsUser($this->desk)->post("/api/v1/tenant/hotel/bookings/{$id}/documents", ['doc_type' => 'aadhaar', 'file' => $file], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonPath('data.documents.0.delete_after', '2026-11-19');

        $doc = GuestDocument::withoutTenancy()->first();
        $original = file_get_contents($file->getRealPath());
        $stored = Storage::disk('local')->get($doc->path);
        $this->assertNotSame($original, $stored);
        $this->assertStringNotContainsString(substr($original, 0, 32), $stored);
        $this->assertSame($original, $this->actingAsUser($this->desk)->get("/api/v1/tenant/hotel/documents/{$doc->id}")->assertOk()->assertHeader('Cache-Control', 'no-store, private')->getContent());
        $this->assertSame(['guest_id.storage_on', 'guest_id.uploaded', 'guest_id.viewed'], AuditLog::query()->where('action', 'like', 'guest_id.%')->orderBy('id')->pluck('action')->all());
        $this->assertSame($this->desk->id, AuditLog::query()->where('action', 'guest_id.viewed')->value('user_id'));
        // Kitchen staff never see them.
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->get("/api/v1/tenant/hotel/documents/{$doc->id}")->assertForbidden();

        $this->travelTo(CarbonImmutable::parse('2026-11-20 09:00', 'Asia/Kolkata'));
        $this->artisan('hotel:purge-documents')->assertSuccessful();
        $this->assertSame(0, GuestDocument::withoutTenancy()->count());
        Storage::disk('local')->assertMissing($doc->path);
        $this->assertTrue(AuditLog::query()->where('action', 'guest_id.auto_deleted')->exists());
    }

    public function test_banquet_enquiries_from_the_website_are_followed_up(): void
    {
        $this->postJson('/api/v1/site/hotel/banquets', ['name' => 'Neha', 'phone' => '9812345678', 'event_type' => 'wedding', 'event_date' => '2026-12-12', 'guests' => 250, 'message' => 'Reception dinner'], $this->site())
            ->assertCreated();
        $this->postJson('/api/v1/site/hotel/banquets', ['name' => 'Neha', 'phone' => '9812345678', 'event_type' => 'party'], $this->site())->assertStatus(422);
        $e = $this->actingAsUser($this->desk)->getJson('/api/v1/tenant/hotel/banquets')->assertOk()->assertJsonPath('meta.counts.new', 1)->json('data.0');
        $this->actingAsUser($this->desk)->putJson("/api/v1/tenant/hotel/banquets/{$e['id']}", ['status' => 'quoted', 'follow_up_on' => '2026-11-15', 'note' => 'Sent menu and hall rates'])
            ->assertOk()->assertJsonPath('data.status', 'quoted')->assertJsonPath('data.notes.0.text', 'Sent menu and hall rates')->assertJsonPath('data.follow_up_on', '2026-11-15');

        $settings = $this->actingAsUser($this->ownerOf($this->tenant))->getJson('/api/v1/tenant/hotel/settings')->json('data');
        $this->actingAsUser($this->ownerOf($this->tenant))->putJson('/api/v1/tenant/hotel/settings', array_replace($settings, ['banquets' => false]))->assertOk();
        $this->postJson('/api/v1/site/hotel/banquets', ['name' => 'Neha', 'phone' => '9812345678', 'event_type' => 'wedding'], $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'not_accepting');
    }
}
