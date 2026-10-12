<?php

namespace Tests\Feature\Growth;

use App\Modules\Tiffin\Notifications\TiffinRequestForStaff;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/** Tiffin subscriptions: plans, website requests, daily deliveries, skips, pauses and renewals. */
class TiffinTest extends OperationsTestCase
{
    public function test_a_tiffin_subscription_from_request_to_renewal(): void
    {
        Notification::fake();
        $this->tenant->update(['timezone' => 'Asia/Kolkata']);
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00', 'Asia/Kolkata'));
        $owner = $this->ownerOf($this->tenant);

        $plan = $this->actingAsUser($owner)->postJson('/api/v1/tenant/tiffin/plans', ['name' => 'Veg lunch', 'diet' => 'veg', 'slot' => 'lunch', 'meals' => 22, 'days_valid' => 30, 'price' => 2400])
            ->assertCreated()->json('data.id');
        $trial = $this->postJson('/api/v1/tenant/tiffin/plans', ['name' => 'Trial', 'slot' => 'both', 'meals' => 2, 'days_valid' => 7, 'price' => 200])->assertCreated()->json('data.id');
        $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/tiffin/plans', ['name' => 'X', 'slot' => 'lunch', 'meals' => 1, 'days_valid' => 1, 'price' => 1])->assertForbidden();
        $this->getJson('/api/v1/tenant/tiffin/plans')->assertOk()->assertJsonCount(2, 'data');

        // A guest asks on the website; staff get an alert.
        $this->getJson('/api/v1/site/tiffin/plans', $this->site())->assertOk()->assertJsonCount(2, 'data');
        $guest = ['meal_plan_id' => $plan, 'name' => 'Ravi Kumar', 'phone' => '98765 43210', 'address' => 'Flat 4, Shanti Nagar', 'starts_on' => '2026-10-11'];
        $this->postJson('/api/v1/site/tiffin/request', $guest, $this->site())->assertStatus(422);
        $this->postJson('/api/v1/site/tiffin/request', ['starts_on' => '2026-10-13'] + $guest, $this->site())->assertCreated()->assertJsonPath('data.code', 'T-0001');
        Notification::assertSentTo([$owner], TiffinRequestForStaff::class);

        // The cashier confirms it once paid, from today.
        $this->actingAsUser($this->cashier);
        $list = $this->getJson('/api/v1/tenant/tiffin/subscriptions')->assertOk()->assertJsonPath('meta.requested', 1)->json('data');
        $id = $list[0]['id'];
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/activate", ['amount' => 2400, 'mode' => 'upi', 'starts_on' => '2026-10-12'])->assertOk()
            ->assertJsonPath('data.status', 'active')->assertJsonPath('data.ends_on', '2026-11-10')->assertJsonPath('data.meals_total', 22);
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/activate", ['amount' => 1, 'mode' => 'upi'])->assertStatus(422);

        // Today's lunch list; not on the dinner list.
        $this->assertSame(['Ravi Kumar'], array_column($this->getJson('/api/v1/tenant/tiffin/day?slot=lunch')->json('data.list'), 'name'));
        $this->assertSame([], $this->getJson('/api/v1/tenant/tiffin/day?slot=dinner')->json('data.list'));
        $mark = fn (array $b) => $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/mark", $b + ['date' => '2026-10-12', 'slot' => 'lunch']);
        $mark(['status' => 'delivered'])->assertOk()->assertJsonPath('data.meals_used', 1);
        $mark(['status' => 'delivered'])->assertOk()->assertJsonPath('data.meals_used', 1);
        $mark(['status' => 'delivered', 'slot' => 'dinner'])->assertStatus(422)->assertJsonPath('meta.code', 'wrong_slot');
        $this->getJson('/api/v1/tenant/tiffin/day?slot=lunch')->assertJsonPath('data.list.0.mark', 'delivered')->assertJsonPath('data.counts.delivered', 1);

        // On leave tomorrow: no meal used, one more day; undone, it goes back.
        $mark(['status' => 'skipped', 'date' => '2026-10-13'])->assertJsonPath('data.ends_on', '2026-11-11')->assertJsonPath('data.meals_used', 1);
        $mark(['status' => null, 'date' => '2026-10-13'])->assertJsonPath('data.ends_on', '2026-11-10');

        // Signed up at the counter on the 2-meal trial (lunch and dinner): used up, then renewed.
        $trialSub = $this->postJson('/api/v1/tenant/tiffin/subscriptions', ['meal_plan_id' => $trial, 'name' => 'Asha', 'phone' => '9123456789', 'address' => 'Shop 2, Main Road', 'starts_on' => '2026-10-12', 'amount' => 200, 'mode' => 'cash'])
            ->assertCreated()->assertJsonPath('data.status', 'active')->assertJsonPath('data.slot', 'both')->json('data.id');
        foreach (['lunch', 'dinner'] as $slot) {
            $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$trialSub}/mark", ['date' => '2026-10-12', 'slot' => $slot, 'status' => 'delivered'])->assertOk();
        }
        $this->getJson('/api/v1/tenant/tiffin/subscriptions?status=completed')->assertJsonPath('data.0.id', $trialSub);
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$trialSub}/mark", ['date' => '2026-10-13', 'slot' => 'lunch', 'status' => 'delivered'])->assertStatus(422);
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$trialSub}/renew", ['amount' => 200, 'mode' => 'upi'])->assertOk()
            ->assertJsonPath('data.status', 'active')->assertJsonPath('data.meals_total', 4)->assertJsonPath('data.ends_on', '2026-10-25');

        // Paused for 3 days: the validity moves 3 days.
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/pause")->assertJsonPath('data.status', 'paused');
        $this->travelTo(CarbonImmutable::parse('2026-10-15 10:00', 'Asia/Kolkata'));
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/resume")->assertJsonPath('data.status', 'active')->assertJsonPath('data.ends_on', '2026-11-13');

        // Payments count as revenue in the profit and loss.
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/finance/pnl?from=2026-10-01&to=2026-10-31')->assertOk()->assertJsonPath('data.revenue.tiffin', '2800.00');
    }
}
