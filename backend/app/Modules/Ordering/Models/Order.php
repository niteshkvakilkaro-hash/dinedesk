<?php

namespace App\Modules\Ordering\Models;

use App\Models\User;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    use BelongsToTenant, HasUlids;

    public const TYPES = ['delivery', 'takeaway', 'dine_in', 'room_service'];

    public const STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

    // room = charged to the guest's room folio (paid at check-out).
    /** upi = straight to the restaurant's UPI ID (confirmed by staff, see payment_reference). */
    public const PAYMENT_METHODS = ['online', 'cod', 'counter', 'room', 'upi'];

    protected $fillable = [
        'tenant_id', 'tracking_token', 'number', 'customer_id', 'type', 'status', 'scheduled_for', 'stock_deducted_at', 'discount_label', 'marketing_opt_in',
        'customer_name', 'customer_phone', 'customer_email', 'address', 'delivery_zone_id', 'table_label', 'dining_table_id', 'table_session_id', 'room_booking_id', 'source', 'created_by', 'rider_id', 'rider_assigned_at', 'notes',
        'subtotal', 'tax_total', 'delivery_fee', 'packaging_fee', 'discount_total', 'total', 'prices_include_tax',
        'payment_method', 'payment_status', 'payment_reference', 'cancel_reason', 'locale', 'placed_at', 'client_ref', 'channel', 'channel_ref', 'commission',
    ];

    protected $hidden = ['tracking_token'];

    protected function casts(): array
    {
        return [
            'scheduled_for' => 'datetime',
            'placed_at' => 'datetime',
            'rider_assigned_at' => 'datetime',
            'address' => 'array',
            'subtotal' => 'decimal:2',
            'tax_total' => 'decimal:2',
            'delivery_fee' => 'decimal:2',
            'packaging_fee' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'total' => 'decimal:2',
            'prices_include_tax' => 'boolean',
            'number' => 'integer',
        ];
    }

    /** ULID only for public_id; the numeric id stays the primary key. */
    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(OrderEvent::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderByDesc('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** The delivery rider taking this order (delivery orders only). */
    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rider_id');
    }

    public function isActive(): bool
    {
        return ! in_array($this->status, ['completed', 'cancelled'], true);
    }
}
