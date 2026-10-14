<?php

namespace Tests\Feature\Operations;

use App\Models\User;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tables\Models\DiningTable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Ordering\OrderingTestCase;

/** Ordering business plus dine-in, two tables and a cashier. Naan ₹60 at 5% GST, Lassi ₹99.99 at 18%. */
abstract class OperationsTestCase extends OrderingTestCase
{
    protected User $cashier;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->asTenant(function () {
            $s = app(OrderingSettings::class)->get();
            $s['types']['dine_in'] = true;
            app(OrderingSettings::class)->save($s);
            DiningTable::create(['label' => 'T1', 'seats' => 4]);
            DiningTable::create(['label' => 'T2', 'seats' => 2]);
        });
        $this->cashier = $this->staff($this->tenant, 'cashier');
    }

    protected function table(string $label): int
    {
        return $this->asTenant(fn () => DiningTable::where('label', $label)->value('id'));
    }

    /** A POS order (confirmed, sent to the kitchen). */
    protected function posOrder(array $items, string $type = 'takeaway', ?string $table = null): TestResponse
    {
        return $this->actingAsUser($this->cashier)->postJson('/api/v1/tenant/pos/orders', array_filter([
            'type' => $type,
            'source' => 'pos',
            'dining_table_id' => $table ? $this->table($table) : null,
            'items' => $items,
        ]));
    }

    protected function naan(int $qty = 1): array
    {
        return ['item_id' => $this->items['naan']->id, 'quantity' => $qty];
    }

    protected function lassi(int $qty = 1): array
    {
        return ['item_id' => $this->items['lassi']->id, 'quantity' => $qty];
    }
}
