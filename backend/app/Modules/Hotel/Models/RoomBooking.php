<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Models\Order;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A stay: pending → confirmed → checked_in → checked_out, or cancelled / no_show.
 * One room per booking; the room is assigned by the front desk.
 */
class RoomBooking extends Model
{
    use BelongsToTenant, HasUlids;

    public const STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];

    /** Bookings that take a room for their nights. */
    public const HOLDING = ['pending', 'confirmed', 'checked_in'];

    public const SOURCES = ['website', 'phone', 'walk_in', 'email', 'other'];

    public const ID_TYPES = ['aadhaar', 'passport', 'driving_licence', 'voter_id', 'other'];

    protected $fillable = [
        'tenant_id', 'code', 'access_token', 'customer_id', 'room_type_id', 'room_id', 'name', 'phone', 'email', 'adults', 'children',
        'check_in', 'check_out', 'nights', 'rates', 'room_total', 'tax_total', 'total', 'advance_due', 'status', 'source', 'arrival_time',
        'requests', 'staff_note', 'company', 'gstin', 'id_type', 'id_last4', 'hold_expires_at', 'confirmed_at', 'checked_in_at', 'checked_out_at',
        'cancelled_by', 'cancel_reason', 'invoice_id', 'locale',
    ];

    protected $hidden = ['access_token'];

    protected function casts(): array
    {
        return [
            'check_in' => 'date:Y-m-d',
            'check_out' => 'date:Y-m-d',
            'rates' => 'array',
            'room_total' => 'decimal:2',
            'tax_total' => 'decimal:2',
            'total' => 'decimal:2',
            'advance_due' => 'decimal:2',
            'adults' => 'integer',
            'children' => 'integer',
            'nights' => 'integer',
            'hold_expires_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
        ];
    }

    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(RoomType::class, 'room_type_id')->withTrashed();
    }

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class)->withTrashed();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(FolioItem::class)->orderBy('service_date')->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(FolioPayment::class)->orderBy('id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(GuestDocument::class)->orderBy('id');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class)->orderBy('id');
    }

    public function isHolding(): bool
    {
        return in_array($this->status, self::HOLDING, true);
    }
}
