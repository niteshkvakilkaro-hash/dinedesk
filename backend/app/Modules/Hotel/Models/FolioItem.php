<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** One charge on a stay's folio. Voided items stay for the record but don't count. */
class FolioItem extends Model
{
    use BelongsToTenant;

    public const TYPES = ['room', 'food', 'extra', 'discount'];

    protected $fillable = ['tenant_id', 'room_booking_id', 'type', 'description', 'service_date', 'quantity', 'unit_price', 'amount', 'tax_rate', 'tax', 'sac', 'order_id', 'created_by', 'voided_at', 'void_reason'];

    protected function casts(): array
    {
        return [
            'service_date' => 'date:Y-m-d',
            'quantity' => 'integer',
            'unit_price' => 'decimal:2',
            'amount' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'tax' => 'decimal:2',
            'voided_at' => 'datetime',
        ];
    }
}
