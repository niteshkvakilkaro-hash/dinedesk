<?php

namespace Tests\Feature\Operations;

use App\Modules\Staff\Models\Attendance;
use Carbon\CarbonImmutable;

/** Shifts and attendance: the rota, clocking in/out, late and absent days, manager corrections. */
class RotaTest extends OperationsTestCase
{
    public function test_staff_clock_in_and_out_against_the_rota(): void
    {
        $this->tenant->update(['timezone' => 'Asia/Kolkata']);
        $this->travelTo(CarbonImmutable::parse('2026-10-12 08:00', 'Asia/Kolkata')); // a Monday
        $owner = $this->ownerOf($this->tenant);
        $waiter = $this->staff($this->tenant, 'waiter');

        $this->actingAsUser($owner);
        $this->postJson('/api/v1/tenant/shifts', ['user_id' => $waiter->id, 'date' => '2026-10-12', 'starts' => '9:00', 'ends' => '17:00'])->assertStatus(422);
        $this->postJson('/api/v1/tenant/shifts', ['user_id' => $waiter->id, 'date' => '2026-10-12', 'starts' => '09:00', 'ends' => '17:00'])->assertCreated();
        $this->postJson('/api/v1/tenant/shifts', ['user_id' => $waiter->id, 'date' => '2026-10-10', 'starts' => '09:00', 'ends' => '17:00'])->assertCreated();
        $this->postJson('/api/v1/tenant/shifts', ['user_id' => $waiter->id, 'date' => '2026-10-13', 'starts' => '18:00', 'ends' => '02:00', 'note' => 'Late shift'])->assertCreated();
        $week = $this->getJson('/api/v1/tenant/shifts?start=2026-10-14')->assertOk()->json('data');
        $this->assertSame('2026-10-12', $week['start']);
        $this->assertCount(2, $week['shifts']);

        // Copy into the next (empty) week; not twice.
        $this->postJson('/api/v1/tenant/shifts/copy-week', ['start' => '2026-10-19'])->assertOk()->assertJsonPath('data.copied', 2);
        $this->postJson('/api/v1/tenant/shifts/copy-week', ['start' => '2026-10-19'])->assertStatus(422)->assertJsonPath('meta.code', 'not_empty');
        $this->assertSame(['2026-10-19', '2026-10-20'], collect($this->getJson('/api/v1/tenant/shifts?start=2026-10-19')->json('data.shifts'))->pluck('date')->sort()->values()->all());

        // The waiter can clock but not see the rota.
        $this->actingAsUser($waiter);
        $this->getJson('/api/v1/tenant/shifts')->assertForbidden();
        $this->travelTo(CarbonImmutable::parse('2026-10-12 09:20', 'Asia/Kolkata'));
        $this->postJson('/api/v1/tenant/attendance/clock')->assertOk()->assertJsonPath('message', 'Clocked in.');
        $this->assertNotNull($this->getJson('/api/v1/tenant/attendance/me')->json('data.open'));
        $this->travelTo(CarbonImmutable::parse('2026-10-12 17:50', 'Asia/Kolkata'));
        $me = $this->postJson('/api/v1/tenant/attendance/clock')->assertOk()->assertJsonPath('message', 'Clocked out.')->json('data');
        $this->assertNull($me['open']);
        $this->assertSame(510, $me['minutes_today']);

        // Late today; Saturday was scheduled but not worked.
        $this->actingAsUser($owner);
        $row = fn () => collect($this->getJson('/api/v1/tenant/attendance?from=2026-10-10&to=2026-10-13')->assertOk()->json('data.rows'))->firstWhere('user_id', $waiter->id);
        $this->assertSame(['scheduled' => 3, 'present' => 1, 'absent' => 1, 'late' => 1, 'minutes' => 510], array_intersect_key($row(), array_flip(['scheduled', 'present', 'absent', 'late', 'minutes'])));

        // The manager adds Saturday (forgot to clock); not in the future.
        $this->postJson('/api/v1/tenant/attendance', ['user_id' => $waiter->id, 'date' => '2026-10-10', 'clock_in' => '09:00', 'clock_out' => '13:00'])->assertCreated()->assertJsonPath('data.source', 'manager');
        $this->postJson('/api/v1/tenant/attendance', ['user_id' => $waiter->id, 'date' => '2026-10-12', 'clock_in' => '23:00'])->assertStatus(422)->assertJsonPath('meta.code', 'future');
        $this->assertSame(0, $row()['absent']);
        $this->assertSame(750, $row()['minutes']);
    }

    public function test_a_forgotten_clock_out_is_closed_with_no_time(): void
    {
        $waiter = $this->staff($this->tenant, 'waiter');
        $this->actingAsUser($waiter)->postJson('/api/v1/tenant/attendance/clock')->assertJsonPath('message', 'Clocked in.');
        $this->travel(20)->hours();
        $this->postJson('/api/v1/tenant/attendance/clock')->assertJsonPath('message', 'Clocked in.');
        $entries = $this->asTenant(fn () => Attendance::where('user_id', $waiter->id)->orderBy('id')->get());
        $this->assertSame('Missed clock-out', $entries[0]->note);
        $this->assertSame(0, $entries[0]->minutes());
        $this->assertNull($entries[1]->clock_out);
    }
}
