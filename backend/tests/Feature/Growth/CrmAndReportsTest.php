<?php

namespace Tests\Feature\Growth;

use App\Modules\Marketing\Notifications\CampaignMessage;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Tests\Feature\Operations\OperationsTestCase;

/** CRM, feedback and reviews, campaigns to opted-in guests, reports and CSV. */
class CrmAndReportsTest extends OperationsTestCase
{
    private function webOrder(array $extra = []): array
    {
        $res = $this->postJson('/api/v1/site/orders', array_replace($this->orderPayload(), $extra), $this->site())->assertCreated();
        $id = $this->asTenant(fn () => Order::where('public_id', $res->json('data.order.id'))->value('id'));
        $owner = $this->ownerOf($this->tenant);
        foreach (['confirmed', 'preparing', 'ready', 'completed'] as $s) {
            $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$id}/status", ['status' => $s])->assertOk();
        }
        $this->app['auth']->forgetGuards();

        return [$res->json('data.order.id'), $res->json('data.token'), $id];
    }

    public function test_feedback_reviews_and_the_customer_record(): void
    {
        [$publicId, $token] = $this->webOrder(['marketing_opt_in' => true]);

        $this->getJson("/api/v1/site/orders/{$publicId}/feedback?t={$token}", $this->site())->assertJsonPath('data.can_rate', true);
        $this->postJson("/api/v1/site/orders/{$publicId}/feedback", ['t' => 'wrong', 'rating' => 5], $this->site())->assertNotFound();
        $this->postJson("/api/v1/site/orders/{$publicId}/feedback", ['t' => $token, 'rating' => 5, 'food' => 5, 'comment' => 'Lovely dal!', 'consent_public' => true], $this->site())->assertCreated();
        $this->postJson("/api/v1/site/orders/{$publicId}/feedback", ['t' => $token, 'rating' => 1], $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'already_rated');

        // Nothing public until the owner publishes it; then as "Asha V." only.
        $this->getJson('/api/v1/site', $this->site())->assertJsonPath('data.growth.reviews.count', 0);
        $owner = $this->ownerOf($this->tenant);
        $f = $this->actingAsUser($owner)->getJson('/api/v1/tenant/feedback')->assertJsonPath('data.summary.average', 5)->json('data.items.0');
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/feedback/{$f['id']}", ['is_published' => true, 'reply' => 'Thank you, Asha!'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/site', $this->site())->assertJsonPath('data.growth.reviews.count', 1)
            ->assertJsonPath('data.growth.reviews.items.0.name', 'Asha V.')->assertJsonPath('data.growth.reviews.items.0.reply', 'Thank you, Asha!');

        // A guest who didn't agree can't be published.
        $this->asTenant(fn () => \App\Modules\Crm\Models\Feedback::create(['rating' => 4, 'consent_public' => false, 'created_at' => now()]));
        $other = $this->asTenant(fn () => \App\Modules\Crm\Models\Feedback::where('consent_public', false)->value('id'));
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/feedback/{$other}", ['is_published' => true])->assertStatus(422);

        // The customer record: spend, visits, opt-in, tags, dates only with consent.
        $c = $this->actingAsUser($owner)->getJson('/api/v1/tenant/customers?q=98290')->assertOk()->json('data.0');
        $this->assertSame([1, true], [$c['visits'], $c['marketing_opt_in']]);
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/customers/{$c['id']}", ['tags' => ['VIP', ' vip ', 'Regular'], 'birthday' => '1990-05-04', 'dates_opt_in' => true])
            ->assertOk()->assertJsonPath('data.tags', ['vip', 'regular'])->assertJsonPath('data.birthday', '1990-05-04');
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/customers/{$c['id']}", ['dates_opt_in' => false])->assertJsonPath('data.birthday', null);
        // Staff can switch offers off but never on for a guest.
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/customers/{$c['id']}", ['marketing_opt_in' => false])->assertJsonPath('data.marketing_opt_in', false);
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/customers/{$c['id']}", ['marketing_opt_in' => true])->assertJsonPath('data.marketing_opt_in', false);
        $this->actingAsUser($owner)->getJson("/api/v1/tenant/customers/{$c['id']}")->assertJsonCount(1, 'data.orders')->assertJsonCount(1, 'data.feedback');
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/customers')->assertForbidden();
    }

    public function test_campaigns_reach_only_opted_in_guests_who_can_unsubscribe(): void
    {
        Notification::fake();
        $this->webOrder(['marketing_opt_in' => true]);
        $this->webOrder(['customer' => ['name' => 'Ravi Kumar', 'phone' => '9811100001']]); // no opt-in
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/marketing/campaigns/audience', ['channel' => 'whatsapp'])->assertJsonPath('data.recipients', 1);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/marketing/campaigns', ['channel' => 'whatsapp', 'name' => 'Diwali', 'message' => 'Hi {name}, 20% off this Diwali!'])
            ->assertCreated()->assertJsonPath('data.recipients', 1);
        Notification::assertSentTimes(CampaignMessage::class, 1);
        Notification::assertSentTo(new AnonymousNotifiable(), CampaignMessage::class, fn ($n) => str_contains($n->toText(), 'Hi Asha, 20% off') && str_contains($n->toText(), '/unsubscribe?t='));

        $token = $this->asTenant(fn () => Customer::where('marketing_opt_in', true)->value('unsubscribe_token'));
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/site/unsubscribe', ['t' => $token], $this->site())->assertOk();
        $this->postJson('/api/v1/site/unsubscribe', ['t' => 'nope'], $this->site())->assertNotFound();
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/marketing/campaigns', ['channel' => 'whatsapp', 'name' => 'Again', 'message' => 'Hello there'])->assertStatus(422)->assertJsonPath('meta.code', 'no_recipients');
    }

    public function test_reports_and_csv_exports_use_real_orders_only(): void
    {
        $this->webOrder();
        $this->posOrder([$this->naan(2)])->assertCreated();
        $cancel = $this->posOrder([$this->lassi()])->json('data.id');
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/orders/{$cancel}/status", ['status' => 'cancelled', 'note' => 'x'])->assertOk();

        $r = $this->actingAsUser($owner)->getJson('/api/v1/tenant/reports/overview?from=2026-11-01&to=2026-11-10')->assertOk();
        $r->assertJsonPath('data.totals.orders', 2)->assertJsonPath('data.totals.cancelled', 1)->assertJsonCount(10, 'data.series')
            ->assertJsonPath('data.series.9.orders', 2)->assertJsonPath('data.dishes.top.0.name', 'Butter Naan')->assertJsonPath('data.heatmap.0.hour', 13)
            ->assertJsonPath('data.heatmap.0.day', 2);
        $this->assertContains('Lassi', collect($r->json('data.dishes.slow'))->pluck('name')->all()); // ordered only in a cancelled order

        $csv = $this->actingAsUser($owner)->get('/api/v1/tenant/reports/export/orders?from=2026-11-01&to=2026-11-10');
        $csv->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $body = $csv->streamedContent();
        $this->assertStringContainsString('Order,"Placed (IST)",Type', $body);
        $this->assertSame(4, count(array_filter(explode("\n", trim($body))))); // header + 3 orders (cancelled listed with its status)
        $this->actingAsUser($owner)->get('/api/v1/tenant/reports/export/nope')->assertNotFound();
        $this->actingAsUser($this->cashier)->getJson('/api/v1/tenant/reports/overview')->assertForbidden();
    }
}
