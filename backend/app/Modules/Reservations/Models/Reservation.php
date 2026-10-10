<?php

namespace App\Modules\Reservations\Models;

use App\Modules\Ordering\Models\Customer;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    use BelongsToTenant;

    public const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'rejected', 'cancelled', 'no_show'];

    /** Bookings that hold a place (count against slot capacity and their table). */
    public const HOLDING = ['pending', 'confirmed', 'seated'];

    public const SOURCES = ['website', 'phone', 'walk_in'];

    protected $fillable = [
        'tenant_id', 'code', 'customer_id', 'name', 'phone', 'email', 'party_size', 'date', 'time', 'starts_at', 'ends_at',
        'dining_table_id', 'status', 'source', 'notes', 'staff_note', 'cancelled_by', 'decided_at', 'decided_by', 'reminder_sent_at', 'locale',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'decided_at' => 'datetime',
            'reminder_sent_at' => 'datetime',
            'party_size' => 'integer',
        ];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id')->withTrashed();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
