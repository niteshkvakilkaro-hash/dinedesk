<?php

namespace App\Modules\Crm\Services;

use App\Modules\Inventory\Services\Stock;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Marketing\Services\Coupons;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * One place for what happens around a customer when an order finishes or is cancelled:
 *  - completed & paid → spend and visits on the customer record, loyalty points earned
 *  - cancelled        → coupon use and points given back, stock put back
 */
class CustomerActivity
{
    public function __construct(
        private readonly Loyalty $loyalty,
        private readonly Coupons $coupons,
        private readonly Stock $stock,
    ) {}

    public function orderCompleted(Order $order): void
    {
        if ($order->payment_status !== 'paid' || ! $order->customer_id) {
            return;
        }
        DB::transaction(function () use ($order) {
            $c = Customer::whereKey($order->customer_id)->lockForUpdate()->first();
            if (! $c) {
                return;
            }
            $c->update([
                'total_spent' => Money::toRupees(Money::toPaise($c->total_spent) + Money::toPaise($order->total)),
                'visits' => $c->visits + 1,
            ]);
            $this->loyalty->earn($order);
        });
    }

    public function orderCancelled(Order $order): void
    {
        $this->coupons->reverse($order->id);
        $this->loyalty->reverseOrder($order);
        $this->stock->restore($order);
    }

    /** A booking ended with the guests seated: counts as a visit. */
    public function bookingVisited(?int $customerId): void
    {
        if ($customerId) {
            Customer::whereKey($customerId)->increment('visits');
        }
    }
}
