<?php

namespace Tests\Feature\Growth;

use App\Modules\Marketing\Notifications\CampaignMessage;
use App\Modules\Ordering\Models\Customer;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Ordering\OrderingTestCase;

/** Birthday, anniversary and "we miss you" messages: opted-in only, never twice. Today is 10 Nov 2026. */
class AutomationsTest extends OrderingTestCase
{
    private function customers(): void
    {
        $this->asTenant(function () {
            Customer::create(['name' => 'Asha Verma', 'phone' => '+919829011111', 'marketing_opt_in' => true, 'dates_opt_in' => true, 'birthday' => '1990-11-10', 'last_order_at' => now()->subDays(3)]);
            // Birthday today but never agreed to share dates / to offers: nothing.
            Customer::create(['name' => 'Ravi', 'phone' => '+919829022222', 'marketing_opt_in' => true, 'dates_opt_in' => false, 'birthday' => '1985-11-10']);
            Customer::create(['name' => 'Meera', 'phone' => '+919829033333', 'marketing_opt_in' => false, 'dates_opt_in' => true, 'birthday' => '1992-11-10']);
            // Away for 45 days: gets "we miss you" once.
            Customer::create(['name' => 'Kabir Shah', 'phone' => '+919829044444', 'marketing_opt_in' => true, 'last_order_at' => now()->subDays(45)]);
        });
    }

    private function switchOn(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $s = $this->actingAsUser($owner)->getJson('/api/v1/tenant/marketing/automations')->assertOk()->json('data.settings');
        $s['birthday']['enabled'] = true;
        $s['winback']['enabled'] = true;
        $s['winback']['days'] = 30;
        $this->putJson('/api/v1/tenant/marketing/automations', $s)->assertOk()
            ->assertJsonPath('data.due_today.birthday', 1)->assertJsonPath('data.due_today.winback', 1);
    }

    public function test_only_opted_in_customers_get_them_and_never_twice(): void
    {
        Notification::fake();
        $this->customers();
        $this->switchOn();

        $this->artisan('marketing:automations')->assertSuccessful();
        Notification::assertSentTimes(CampaignMessage::class, 2);
        Notification::assertSentTo(new AnonymousNotifiable, CampaignMessage::class, fn ($n, $channels, $to) => $to->routes['whatsapp'] === '+919829011111' && str_contains($n->toText(), 'Happy birthday, Asha!') && str_contains($n->toText(), '/unsubscribe?t='));
        Notification::assertSentTo(new AnonymousNotifiable, CampaignMessage::class, fn ($n, $channels, $to) => $to->routes['whatsapp'] === '+919829044444' && str_contains($n->toText(), 'We miss you, Kabir!'));

        // Running again the same day, or the next days, sends nothing new.
        $this->artisan('marketing:automations')->assertSuccessful();
        $this->travel(1)->days();
        $this->artisan('marketing:automations')->assertSuccessful();
        Notification::assertSentTimes(CampaignMessage::class, 2);

        // Both order again, then stay away for 31 days: each gets one new reminder.
        $this->asTenant(fn () => Customer::whereIn('name', ['Kabir Shah', 'Asha Verma'])->update(['last_order_at' => now()]));
        $this->travel(31)->days();
        $this->artisan('marketing:automations')->assertSuccessful();
        Notification::assertSentTimes(CampaignMessage::class, 4);
    }

    public function test_switched_off_demo_and_validation(): void
    {
        Notification::fake();
        $this->customers();
        $this->artisan('marketing:automations')->assertSuccessful();
        Notification::assertNothingSent();

        $owner = $this->ownerOf($this->tenant);
        $s = $this->actingAsUser($owner)->getJson('/api/v1/tenant/marketing/automations')->json('data.settings');
        $s['channel'] = 'sms';
        $this->putJson('/api/v1/tenant/marketing/automations', $s)->assertStatus(422);
        $this->actingAsUser($this->staff($this->tenant, 'cashier'))->getJson('/api/v1/tenant/marketing/automations')->assertForbidden();
    }
}
