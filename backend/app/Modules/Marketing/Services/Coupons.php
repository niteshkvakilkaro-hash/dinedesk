<?php

namespace App\Modules\Marketing\Services;

use App\Modules\Marketing\Models\Coupon;
use App\Modules\Marketing\Models\CouponRedemption;
use App\Modules\Ordering\Support\Money;
use App\Support\ApiException;
use Illuminate\Support\Facades\DB;

/**
 * Coupon codes. The discount is worked out on the items' value before GST (the same
 * base the bill uses), so GST is charged on what the guest actually pays.
 */
class Coupons
{
    /** Finds a usable coupon for a channel ("online" or "pos"), or explains why not. */
    public function find(string $code, string $channel): Coupon
    {
        $coupon = Coupon::where('code', strtoupper(trim($code)))->first();
        $invalid = fn (string $why) => new ApiException($why, 422, 'coupon_invalid', ['field' => 'coupon_code']);
        if (! $coupon || ! $coupon->is_active) {
            throw $invalid('This coupon code is not valid.');
        }
        if (! $coupon->{$channel}) {
            throw $invalid($channel === 'online' ? 'This coupon can be used only at the restaurant.' : 'This coupon is for online orders only.');
        }
        if ($coupon->starts_at && now()->lt($coupon->starts_at)) {
            throw $invalid('This coupon is not active yet.');
        }
        if ($coupon->ends_at && now()->gt($coupon->ends_at)) {
            throw $invalid('This coupon has expired.');
        }
        if ($coupon->usage_limit !== null && $coupon->used_count >= $coupon->usage_limit) {
            throw $invalid('This coupon has been fully used.');
        }

        return $coupon;
    }

    /** Discount in paise on $itemsPaise (value before GST), checking minimum order and the per-guest limit. */
    public function discount(Coupon $coupon, int $itemsPaise, ?int $customerId): int
    {
        $min = Money::toPaise($coupon->min_order);
        if ($itemsPaise < $min) {
            throw new ApiException('Add items worth ₹'.Money::toRupees($min - $itemsPaise).' more to use this coupon (minimum ₹'.Money::toRupees($min).' before GST).', 422, 'coupon_min_order', ['field' => 'coupon_code']);
        }
        if ($customerId && $coupon->per_customer_limit !== null) {
            $used = CouponRedemption::where('coupon_id', $coupon->id)->where('customer_id', $customerId)->whereNull('reversed_at')->count();
            if ($used >= $coupon->per_customer_limit) {
                throw new ApiException('You have already used this coupon.', 422, 'coupon_used', ['field' => 'coupon_code']);
            }
        }
        $off = $coupon->type === 'percent'
            ? (int) round($itemsPaise * (float) $coupon->value / 100)
            : Money::toPaise($coupon->value);
        if ($coupon->type === 'percent' && $coupon->max_discount !== null) {
            $off = min($off, Money::toPaise($coupon->max_discount));
        }

        return min($off, $itemsPaise);
    }

    /** Records a use (inside the order / bill transaction); the usage limit is re-checked under a lock. */
    public function redeem(Coupon $coupon, int $paise, ?int $orderId, ?int $invoiceId, ?int $customerId): void
    {
        $locked = Coupon::whereKey($coupon->id)->lockForUpdate()->first();
        if ($locked->usage_limit !== null && $locked->used_count >= $locked->usage_limit) {
            throw new ApiException('This coupon has just been fully used.', 422, 'coupon_invalid', ['field' => 'coupon_code']);
        }
        $locked->increment('used_count');
        CouponRedemption::create([
            'coupon_id' => $coupon->id, 'order_id' => $orderId, 'invoice_id' => $invoiceId, 'customer_id' => $customerId,
            'amount' => Money::toRupees($paise), 'created_at' => now(),
        ]);
    }

    /** Gives the use back (order cancelled, bill cancelled). */
    public function reverse(?int $orderId, ?int $invoiceId = null): void
    {
        DB::transaction(function () use ($orderId, $invoiceId) {
            $rows = CouponRedemption::whereNull('reversed_at')
                ->where(fn ($q) => $q->when($orderId, fn ($w) => $w->where('order_id', $orderId))->when($invoiceId, fn ($w) => $w->orWhere('invoice_id', $invoiceId)))
                ->lockForUpdate()->get();
            foreach ($rows as $r) {
                $r->update(['reversed_at' => now()]);
                Coupon::whereKey($r->coupon_id)->where('used_count', '>', 0)->decrement('used_count');
            }
        });
    }

    /** Coupons the business chose to show on its website (live ones only). */
    public function publicList(): array
    {
        return Coupon::where('is_active', true)->where('is_public', true)->where('online', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('used_count', '<', 'usage_limit'))
            ->orderBy('min_order')->get()
            ->map(fn (Coupon $c) => [
                'code' => $c->code, 'description' => $c->description, 'type' => $c->type, 'value' => $c->value,
                'max_discount' => $c->max_discount, 'min_order' => $c->min_order, 'ends_at' => $c->ends_at?->toIso8601String(),
            ])->all();
    }
}
