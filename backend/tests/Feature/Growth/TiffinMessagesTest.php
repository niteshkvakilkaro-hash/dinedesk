<?php

namespace Tests\Feature\Growth;

use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tiffin\Models\MealSubscription;
use App\Modules\Tiffin\Notifications\TiffinMessage;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/** Tiffin subscribers hear about their subscription (confirmed, declined, paused, resumed, cancelled) in their own language. */
class TiffinMessagesTest extends OperationsTestCase
{
    private int $plan;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant->update(['timezone' => 'Asia/Kolkata']);
        $this->travelTo(CarbonImmutable::parse('2026-10-12 10:00', 'Asia/Kolkata'));
        $this->plan = $this->actingAsUser($this->ownerOf($this->tenant))
            ->postJson('/api/v1/tenant/tiffin/plans', ['name' => 'Veg lunch', 'slot' => 'lunch', 'meals' => 22, 'days_valid' => 30, 'price' => 2400])->json('data.id');
        $this->app['auth']->forgetGuards();
    }

    private function channels(array $on): void
    {
        $this->asTenant(function () use ($on) {
            $s = app(OrderingSettings::class)->get();
            $s['notifications'] = $on + ['email' => false, 'whatsapp' => false, 'sms' => false];
            app(OrderingSettings::class)->save($s);
        });
    }

    private function request(string $locale, string $phone = '98765 43210'): int
    {
        $this->postJson('/api/v1/site/tiffin/request', ['meal_plan_id' => $this->plan, 'name' => 'Ravi Kumar', 'phone' => $phone, 'address' => 'Flat 4, Shanti Nagar', 'starts_on' => '2026-10-13'], $this->site() + ['X-Locale' => $locale])
            ->assertCreated();

        return MealSubscription::withoutTenancy()->latest('id')->value('id');
    }

    /** @return list<TiffinMessage> */
    private function sent(): array
    {
        return Notification::sent(new AnonymousNotifiable, TiffinMessage::class)->all();
    }

    public function test_each_change_is_messaged_in_the_subscribers_language(): void
    {
        $this->channels(['whatsapp' => true]);
        $id = $this->request('ta');
        $this->assertSame('ta', MealSubscription::withoutTenancy()->find($id)->locale);
        $this->assertSame([], $this->sent()); // the request itself: staff are alerted, the guest saw the confirmation on screen

        $this->actingAsUser($this->cashier);
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/activate", ['amount' => 2400, 'mode' => 'upi', 'starts_on' => '2026-10-12'])->assertOk();
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/pause")->assertOk();
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/resume")->assertOk();
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/cancel")->assertOk();
        $this->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/cancel")->assertOk(); // already cancelled: nothing more

        $sent = $this->sent();
        $this->assertSame(['confirmed', 'paused', 'resumed', 'cancelled'], array_map(fn (TiffinMessage $n) => $n->kind, $sent));
        $this->assertSame(['whatsapp'], $sent[0]->channels);
        // Tamil text, Tamil month names, Western digits.
        $this->assertSame('Spice Route: உங்கள் டிஃபின் திட்டம் Veg lunch உறுதிசெய்யப்பட்டது (சந்தா T-0001). 12 அக்டோபர் 2026 முதல் 10 நவம்பர் 2026 வரை உணவு கிடைக்கும்.', $sent[0]->toText());
        $this->assertStringContainsString('நிறுத்தி வைக்கப்பட்டுள்ளது', $sent[1]->toText());
        $this->assertStringContainsString('10 நவம்பர் 2026 வரை', $sent[2]->toText());
        $this->assertSame('Spice Route-இல் உங்கள் டிஃபின் சந்தா T-0001 ரத்து செய்யப்பட்டது.', $sent[3]->toText());
        Notification::assertSentTo(new AnonymousNotifiable, TiffinMessage::class, fn ($n, $channels, $to) => $to->routes['whatsapp'] === '+919876543210');
    }

    public function test_a_declined_request_in_hindi_and_counter_signups_in_english(): void
    {
        $this->channels(['sms' => true]);
        $id = $this->request('hi');
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson('/api/v1/tenant/tiffin/subscriptions', ['meal_plan_id' => $this->plan, 'name' => 'Asha', 'phone' => '9123456789', 'address' => 'Shop 2, Main Road', 'starts_on' => '2026-10-12', 'amount' => 2400, 'mode' => 'cash'])
            ->assertCreated();

        [$declined, $counter] = $this->sent();
        $this->assertSame(['declined', ['sms']], [$declined->kind, $declined->channels]);
        $this->assertSame('माफ़ कीजिए, Spice Route आपका टिफ़िन प्लान Veg lunch शुरू नहीं कर सकता (अनुरोध T-0001)। कोई सवाल हो तो हमें कॉल करें।', $declined->toText());
        $this->assertSame('Spice Route: your tiffin plan Veg lunch is confirmed (subscription T-0002). Meals from 12 Oct 2026 to 10 Nov 2026.', $counter->toText());
        $this->assertSame('Spice Route — tiffin T-0002', $counter->toMail(new AnonymousNotifiable)->subject);
    }

    public function test_nothing_goes_out_on_channels_the_business_switched_off(): void
    {
        $this->channels(['email' => true]); // the default: email only, and subscribers give no email
        $id = $this->request('ta');
        $this->actingAsUser($this->cashier)->postJson("/api/v1/tenant/tiffin/subscriptions/{$id}/activate", ['amount' => 2400, 'mode' => 'upi'])->assertOk();
        Notification::assertNotSentTo(new AnonymousNotifiable, TiffinMessage::class);
    }
}
