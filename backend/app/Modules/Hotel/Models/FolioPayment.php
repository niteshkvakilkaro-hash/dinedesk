<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** Money received for a stay (or given back), counted on the day it changed hands. */
class FolioPayment extends Model
{
    use BelongsToTenant;

    public const KINDS = ['advance', 'payment', 'refund'];

    public const MODES = ['cash', 'upi', 'card', 'online', 'other'];

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'room_booking_id', 'kind', 'mode', 'amount', 'reference', 'received_by', 'received_at', 'business_date'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'received_at' => 'datetime', 'business_date' => 'date:Y-m-d'];
    }
}
