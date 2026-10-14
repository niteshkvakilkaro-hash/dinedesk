<?php

namespace Tests\Feature\Tables;

use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Plans\Models\Plan;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableRequest;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Ordering\OrderingTestCase;

/** QR table ordering: running table bills, waiter / bill requests and settling. */
class QrOrderingTest extends OrderingTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['types']['dine_in'] = true;
            app(OrderingSettings::class)->save($s);
        });
    }

    private function token(string $label): string
    {
        return $this->asTenant(fn () => DiningTable::where('label', $label)->value('qr_token'));
    }

    private function tableOrder(string $token, string $name, array $items): TestResponse
    {
        return $this->postJson('/api/v1/site/orders', [
            'type' => 'dine_in', 'payment_method' => 'counter', 'table_token' => $token,
            'customer' => ['name' => $name], 'items' => $items,
        ], $this->site());
    }

    public function test_guests_at_a_table_share_a_running_bill_until_staff_settle_it(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/tables', ['label' => 'T1', 'seats' => 4, 'area' => 'Terrace'])
            ->assertCreated()->assertJsonPath('data.label', 'T1');
        $url = $this->actingAsUser($owner)->getJson('/api/v1/tenant/tables')->json('data.tables.0.qr_url');
        $token = $this->token('T1');
        $this->assertStringEndsWith("/t/{$token}", $url);
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/v1/site/tables/{$token}", $this->site())->assertOk()
            ->assertJsonPath('data.label', 'T1')->assertJsonPath('data.session', null);
        // Bill before ordering anything: nothing to bill.
        $this->postJson("/api/v1/site/tables/{$token}/requests", ['type' => 'bill'], $this->site())->assertStatus(422)->assertJsonPath('meta.code', 'no_session');

        // Two guests order separately (no phone needed at the table).
        $this->tableOrder($token, 'Kabir', [['item_id' => $this->items['naan']->id, 'quantity' => 2]])
            ->assertCreated()->assertJsonPath('data.order.table_label', 'T1')->assertJsonPath('data.order.type', 'dine_in');
        $this->tableOrder($token, 'Isha', [['item_id' => $this->items['lassi']->id, 'quantity' => 1]])->assertCreated();

        $view = $this->getJson("/api/v1/site/tables/{$token}", $this->site())->assertOk();
        $view->assertJsonCount(2, 'data.session.orders')->assertJsonMissingPath('data.session.orders.0.customer_name');
        $orderTotals = array_map(fn ($o) => (float) $o['total'], $view->json('data.session.orders'));
        $this->assertEqualsWithDelta(array_sum($orderTotals), (float) $view->json('data.session.totals.total'), 0.001);

        // Waiter twice in a row = one request; then the bill.
        $this->postJson("/api/v1/site/tables/{$token}/requests", ['type' => 'waiter'], $this->site())->assertOk()->assertJsonPath('data.open_requests', ['waiter']);
        $this->postJson("/api/v1/site/tables/{$token}/requests", ['type' => 'waiter'], $this->site())->assertOk();
        $this->assertSame(1, $this->asTenant(fn () => TableRequest::where('type', 'waiter')->count()));
        $this->postJson("/api/v1/site/tables/{$token}/requests", ['type' => 'bill'], $this->site())->assertOk()->assertJsonPath('data.session.bill_requested', true);

        // Staff: live board, alerts feed, the bill, then settle.
        $waiter = $this->staff($this->tenant, 'waiter');
        $live = $this->actingAsUser($waiter)->getJson('/api/v1/tenant/tables/live')->assertOk();
        $live->assertJsonPath('data.tables.0.state', 'bill_requested')->assertJsonPath('data.tables.0.session.orders_count', 2)->assertJsonCount(2, 'data.tables.0.requests');
        $this->actingAsUser($waiter)->getJson('/api/v1/tenant/tables/feed?after=0')->assertJsonPath('data.open', 2);
        $sessionId = $live->json('data.tables.0.session.id');
        $this->actingAsUser($waiter)->getJson("/api/v1/tenant/tables/sessions/{$sessionId}")->assertOk()
            ->assertJsonPath('data.orders.0.customer_name', 'Kabir')->assertJsonPath('data.totals.due', $view->json('data.session.totals.total'));
        $waiterRequest = $this->asTenant(fn () => TableRequest::where('type', 'waiter')->value('id'));
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/requests/{$waiterRequest}/done")->assertOk();

        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/sessions/{$sessionId}/close", ['payment_mode' => 'upi'])->assertOk();
        $this->actingAsUser($waiter)->postJson("/api/v1/tenant/tables/sessions/{$sessionId}/close", ['payment_mode' => 'upi'])->assertStatus(422);
        $this->assertDatabaseHas('table_sessions', ['id' => $sessionId, 'status' => 'closed', 'payment_mode' => 'upi']);
        $this->assertSame(2, $this->asTenant(fn () => Order::where('status', 'completed')->where('payment_status', 'paid')->count()));
        // Settled: the table needs cleaning, then it is free.
        $live = $this->actingAsUser($waiter)->getJson('/api/v1/tenant/tables/live')->assertJsonPath('data.tables.0.state', 'cleaning')->assertJsonCount(0, 'data.tables.0.requests');
        $this->actingAsUser($waiter)->postJson('/api/v1/tenant/tables/'.$live->json('data.tables.0.id').'/clean')->assertOk();
        $this->actingAsUser($waiter)->getJson('/api/v1/tenant/tables/live')->assertJsonPath('data.tables.0.state', 'free');
        // The settle made a GST invoice paid by UPI.
        $this->assertDatabaseHas('bill_payments', ['tenant_id' => $this->tenant->id, 'mode' => 'upi']);

        // The next guests start a fresh bill.
        $this->app['auth']->forgetGuards();
        $this->tableOrder($token, 'Next guest', [['item_id' => $this->items['naan']->id, 'quantity' => 1]])->assertCreated();
        $this->getJson("/api/v1/site/tables/{$token}", $this->site())->assertJsonCount(1, 'data.session.orders');
    }

    public function test_qr_codes_can_be_switched_off_or_replaced(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $id = $this->actingAsUser($owner)->postJson('/api/v1/tenant/tables', ['label' => 'T2', 'seats' => 2])->json('data.id');
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/tables', ['label' => 't2 ', 'seats' => 2])->assertStatus(422);
        $old = $this->token('T2');

        $this->actingAsUser($owner)->postJson("/api/v1/tenant/tables/{$id}/qr")->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/site/tables/{$old}", $this->site())->assertNotFound();
        $this->getJson('/api/v1/site/tables/'.$this->token('T2'), $this->site())->assertOk();

        $this->actingAsUser($owner)->putJson("/api/v1/tenant/tables/{$id}", ['label' => 'T2', 'seats' => 2, 'is_active' => false])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/site/tables/'.$this->token('T2'), $this->site())->assertNotFound();
        $this->tableOrder($this->token('T2'), 'Guest', [['item_id' => $this->items['naan']->id, 'quantity' => 1]])->assertNotFound();

        // A table with a running bill can't be removed.
        $this->actingAsUser($owner)->putJson("/api/v1/tenant/tables/{$id}", ['label' => 'T2', 'seats' => 2, 'is_active' => true])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->tableOrder($this->token('T2'), 'Guest', [['item_id' => $this->items['naan']->id, 'quantity' => 1]])->assertCreated();
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/tables/{$id}")->assertStatus(422)->assertJsonPath('meta.code', 'table_in_use');
    }

    public function test_plan_roles_and_businesses_are_respected(): void
    {
        $this->asTenant(fn () => DiningTable::create(['label' => 'T1', 'seats' => 4]));
        $token = $this->token('T1');

        // Waiters run the board but don't set up tables; the kitchen sees neither.
        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->getJson('/api/v1/tenant/tables/live')->assertOk();
        $this->actingAsUser($this->staff($this->tenant, 'waiter'))->postJson('/api/v1/tenant/tables', ['label' => 'X', 'seats' => 2])->assertForbidden();
        $this->actingAsUser($this->staff($this->tenant, 'kitchen'))->getJson('/api/v1/tenant/tables/live')->assertForbidden();

        // Another business can't use this table's QR on its own site, or see its tables.
        $other = $this->business('Other Place', 'growth', ['status' => 'live']);
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/site/tables/{$token}", ['X-Tenant-Host' => $this->host($other)])->assertNotFound();
        $this->actingAsUser($this->ownerOf($other))->getJson('/api/v1/tenant/tables')->assertJsonCount(0, 'data.tables');

        // QR ordering is a Growth feature.
        $this->tenant->update(['plan_id' => Plan::where('code', 'starter')->value('id')]);
        $this->app->forgetScopedInstances(); // a new request in production
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/v1/site/tables/{$token}", $this->site())->assertForbidden();
        $this->tableOrder($token, 'Guest', [['item_id' => $this->items['naan']->id, 'quantity' => 1]])->assertStatus(422)->assertJsonPath('meta.code', 'qr_unavailable');
    }
}
