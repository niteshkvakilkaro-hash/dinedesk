<?php

namespace App\Modules\Ordering\Services;

use App\Modules\Ordering\Models\Order;

class OrderPresenter
{
    /** What the customer sees on the tracking page (no internal ids or staff names). */
    public function forCustomer(Order $o): array
    {
        return [
            'id' => $o->public_id,
            'number' => $o->number,
            'type' => $o->type,
            'status' => $o->status,
            'scheduled_for' => $o->scheduled_for?->toIso8601String(),
            'placed_at' => $o->placed_at->toIso8601String(),
            'customer_name' => $o->customer_name,
            'address' => $o->address ? array_diff_key($o->address, array_flip(['lat', 'lng'])) : null,
            'table_label' => $o->table_label,
            'notes' => $o->notes,
            'items' => $o->items->map(fn ($i) => $this->line($i))->values(),
            'subtotal' => $o->subtotal,
            'tax_total' => $o->tax_total,
            'delivery_fee' => $o->delivery_fee,
            'packaging_fee' => $o->packaging_fee,
            'discount_total' => $o->discount_total,
            'discount_label' => $o->discount_label,
            'total' => $o->total,
            'prices_include_tax' => $o->prices_include_tax,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
            'payment_reference' => $o->payment_reference,
            'cancel_reason' => $o->cancel_reason,
            'timeline' => $o->events->filter(fn ($e) => in_array($e->status, Order::STATUSES, true))
                ->map(fn ($e) => ['status' => $e->status, 'at' => $e->created_at->toIso8601String()])->values(),
        ];
    }

    /** Dashboard view: adds contact details, staff notes and the full event log. */
    public function forStaff(Order $o): array
    {
        return $this->forCustomer($o) + [
            'internal_id' => $o->id,
            'customer_phone' => $o->customer_phone,
            'customer_email' => $o->customer_email,
            'address_full' => $o->address,
            // Delivery orders: the rider taking it (staff only; guests see a first name and position).
            'rider' => $o->rider_id ? ['id' => $o->rider_id, 'name' => $o->rider?->name, 'assigned_at' => $o->rider_assigned_at?->toIso8601String()] : null,
            'events' => $o->events->map(fn ($e) => ['status' => $e->status, 'note' => $e->note, 'at' => $e->created_at->toIso8601String()])->values(),
            'next' => array_values(array_filter(
                OrderFlow::TRANSITIONS[$o->status] ?? [],
                fn ($s) => $s !== 'out_for_delivery' || $o->type === 'delivery',
            )),
        ];
    }

    /** One order on a table's running bill, as guests at that table see it (no names or phones). */
    public function forTable(Order $o): array
    {
        return [
            'number' => $o->number,
            'status' => $o->status,
            'placed_at' => $o->placed_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => $this->line($i))->values(),
            'subtotal' => $o->subtotal,
            'tax_total' => $o->tax_total,
            'total' => $o->total,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
        ];
    }

    public function row(Order $o): array
    {
        return [
            'id' => $o->id,
            'public_id' => $o->public_id,
            'number' => $o->number,
            'type' => $o->type,
            'status' => $o->status,
            'customer_name' => $o->customer_name,
            'customer_phone' => $o->customer_phone,
            'items_count' => (int) ($o->items_sum_quantity ?? $o->items->sum('quantity')),
            'total' => $o->total,
            'payment_method' => $o->payment_method,
            'payment_status' => $o->payment_status,
            'scheduled_for' => $o->scheduled_for?->toIso8601String(),
            'placed_at' => $o->placed_at->toIso8601String(),
            'table_label' => $o->table_label,
            'rider_name' => $o->rider_id && $o->relationLoaded('rider') ? $o->rider?->name : null,
        ];
    }

    private function line($i): array
    {
        return [
            // Lets the guest order the same dish again (matched to today's menu and prices).
            'item_id' => $i->menu_item_id,
            'name' => $i->name,
            'name_hi' => $i->name_hi,
            'variant_name' => $i->variant_name,
            'addons' => $i->addons ?? [],
            'food_type' => $i->food_type,
            'unit_price' => $i->unit_price,
            'quantity' => $i->quantity,
            'tax_rate' => $i->tax_rate,
            'line_total' => $i->line_total,
            'notes' => $i->notes,
        ];
    }
}
