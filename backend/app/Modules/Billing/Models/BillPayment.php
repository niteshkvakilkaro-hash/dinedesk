<?php

namespace App\Modules\Billing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class BillPayment extends Model
{
    use BelongsToTenant;

    public const MODES = ['cash', 'upi', 'card', 'gift_card', 'online', 'other'];

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'invoice_id', 'mode', 'amount', 'reference', 'received_by', 'received_at', 'business_date'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'received_at' => 'datetime', 'business_date' => 'date:Y-m-d'];
    }
}
