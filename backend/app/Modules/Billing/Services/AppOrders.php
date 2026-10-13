<?php

namespace App\Modules\Billing\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Ordering\Support\Money;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

/**
 * Swiggy / Zomato orders entered at the POS (there is no public API to pull them in). The
 * order goes to the kitchen, gets its GST bill, and is marked paid through the app (the app
 * collects from the guest and settles later). The app's commission — its percentage of the food
 * value before GST — is kept on the order for the profit and loss.
 */
class AppOrders
{
    public const APPS = ['swiggy' => 'Swiggy', 'zomato' => 'Zomato'];

    public function __construct(
        private readonly OrderFlow $flow,
        private readonly Billing $billing,
        private readonly OrderingSettings $settings,
    ) {}

    /** The apps switched on, with their commission %. */
    public function enabled(): array
    {
        return array_filter($this->settings->get()['apps'] ?? [], fn ($a) => $a['enabled']);
    }

    /** @return array{order: Order, invoice: Invoice} */
    public function place(Tenant $tenant, array $data, User $by): array
    {
        $app = $this->enabled()[$data['channel']] ?? null;
        if (! $app) {
            throw new ApiException('Switch this app on in Ordering settings first.', 422, 'app_off');
        }
        $ref = isset($data['channel_ref']) ? trim(strip_tags($data['channel_ref'])) : null;
        if ($ref && Order::where('channel', $data['channel'])->where('channel_ref', $ref)->exists()) {
            throw new ApiException(self::APPS[$data['channel']]." order {$ref} is already entered.", 422, 'app_duplicate');
        }

        return DB::transaction(function () use ($tenant, $data, $by, $app, $ref) {
            $order = $this->flow->placeByStaff($tenant, [
                'type' => 'takeaway',
                'items' => $data['items'],
                'customer' => $data['customer'] ?? null,
                'notes' => $data['notes'] ?? null,
            ], $by, 'pos');
            $commission = (int) round(Money::toPaise($order->subtotal) * (float) $app['commission'] / 100);
            $order->update(['channel' => $data['channel'], 'channel_ref' => $ref ?: null, 'commission' => Money::toRupees($commission)]);

            $invoice = $this->billing->bill($tenant, collect([$order->fresh()]), null, null, null, $by);
            $invoice = $this->billing->pay($invoice, [['mode' => 'app', 'amount' => $invoice->total, 'reference' => trim(self::APPS[$data['channel']].' '.($ref ?? ''))]], $by);
            AuditLog::record('pos.app_order', $order, ['app' => $data['channel'], 'ref' => $ref, 'commission' => $order->commission]);

            return ['order' => $order->fresh(), 'invoice' => $invoice];
        });
    }
}
