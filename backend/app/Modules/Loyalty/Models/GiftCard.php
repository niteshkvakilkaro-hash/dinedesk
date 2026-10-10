<?php

namespace App\Modules\Loyalty\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class GiftCard extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'code', 'initial_value', 'balance', 'issued_to', 'phone', 'status', 'expires_on', 'issued_by'];

    protected function casts(): array
    {
        return ['initial_value' => 'decimal:2', 'balance' => 'decimal:2', 'expires_on' => 'date:Y-m-d'];
    }
}
