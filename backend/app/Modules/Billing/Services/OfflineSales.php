<?php

namespace App\Modules\Billing\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Offline POS. While the internet is down the counter keeps selling (takeaway / counter sales,
 * paid in cash, UPI or card) and saves each sale on the device with its own id. When the
 * connection is back the sales come here: each becomes an order, a GST bill and its payment,
 * exactly once. Bills are numbered and dated when they reach the server.
 */
class OfflineSales
{
    public function __construct(
        private readonly OrderFlow $flow,
        private readonly Billing $billing,
        private readonly OrderingSettings $settings,
    ) {}

    /** What the counter needs to price a sale with no connection (kept on the device). */
    public function pack(): array
    {
        $s = $this->settings->get();
        $default = Money::rateBp($s['default_tax_rate']);
        $rates = MenuItem::with('category:id,tax_rate')->get(['id', 'menu_category_id', 'tax_rate'])
            ->mapWithKeys(fn (MenuItem $i) => [$i->id => $i->tax_rate !== null ? Money::rateBp($i->tax_rate) : ($i->category?->tax_rate !== null ? Money::rateBp($i->category->tax_rate) : $default)]);

        return [
            'prices_include_tax' => (bool) $s['prices_include_tax'],
            'packaging_fee' => Money::toPaise($s['packaging_fee']),
            'rates' => $rates,
            'at' => now()->toIso8601String(),
        ];
    }

    /**
     * One sale from the device.
     *
     * @return array{ref: string, status: 'synced'|'duplicate'|'needs_attention'|'failed', order_number?: int, bill?: string, message?: string}
     */
    public function sync(Tenant $tenant, array $sale, User $by): array
    {
        $ref = $sale['ref'];
        if ($order = Order::where('client_ref', $ref)->first()) {
            return ['ref' => $ref, 'status' => 'duplicate', 'order_number' => $order->number, 'bill' => $this->billFor($order)?->number];
        }

        try {
            $order = $this->flow->placeByStaff($tenant, [
                'type' => 'takeaway',
                'items' => $sale['items'],
                'customer' => $sale['customer'] ?? null,
                'notes' => $sale['notes'] ?? null,
            ], $by, 'pos');
        } catch (ApiException $e) {
            return ['ref' => $ref, 'status' => 'failed', 'message' => $e->getMessage()];
        }
        // When it was actually sold (the device clock, kept within the last two days).
        $at = CarbonImmutable::parse($sale['at']);
        $at = $at->isFuture() || $at->lt(now()->subDays(2)) ? now() : $at;
        $order->update(['client_ref' => $ref, 'placed_at' => $at]);
        AuditLog::record('pos.offline_sale', $order, ['ref' => $ref, 'sold_at' => $at->toIso8601String(), 'total' => $sale['total'] ?? null]);

        $invoice = $this->billing->bill($tenant, collect([$order->fresh()]), null, null, null, $by);
        $due = Money::toPaise($invoice->total);
        $paid = array_sum(array_map(fn ($p) => Money::toPaise($p['amount']), $sale['payments']));
        if ($paid < $due) {
            // Prices changed while offline (or a dish was edited): the cashier settles the difference.
            return ['ref' => $ref, 'status' => 'needs_attention', 'order_number' => $order->number, 'bill' => $invoice->number,
                'message' => 'Collected ₹'.Money::toRupees($paid).' but the bill is ₹'.Money::toRupees($due).'. Settle it in Open bills.'];
        }
        try {
            $this->billing->pay($invoice, $this->allocate($sale['payments'], $due), $by);
        } catch (Throwable $e) {
            return ['ref' => $ref, 'status' => 'needs_attention', 'order_number' => $order->number, 'bill' => $invoice->number, 'message' => $e->getMessage()];
        }

        return ['ref' => $ref, 'status' => 'synced', 'order_number' => $order->number, 'bill' => $invoice->number];
    }

    /** Non-cash up to the bill, cash for the rest (only cash can have change). */
    private function allocate(array $payments, int $due): array
    {
        $out = [];
        $left = $due;
        foreach ($payments as $p) {
            if ($p['mode'] === 'cash') {
                continue;
            }
            $amount = min(Money::toPaise($p['amount']), $left);
            if ($amount > 0) {
                $out[] = ['mode' => $p['mode'], 'amount' => Money::toRupees($amount), 'reference' => $p['reference'] ?? null];
                $left -= $amount;
            }
        }
        $cash = array_sum(array_map(fn ($p) => $p['mode'] === 'cash' ? Money::toPaise($p['amount']) : 0, $payments));
        if ($cash > 0 && $left > 0) {
            $out[] = ['mode' => 'cash', 'amount' => Money::toRupees($cash)];
        }

        return $out;
    }

    private function billFor(Order $order): ?Invoice
    {
        return Invoice::whereHas('orders', fn ($q) => $q->whereKey($order->id))->where('status', '!=', 'void')->first();
    }
}
