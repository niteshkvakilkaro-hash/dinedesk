<?php

namespace App\Modules\Billing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class DayClosing extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'business_date', 'opening_cash', 'expected_cash', 'counted_cash', 'difference', 'notes', 'summary', 'closed_by'];

    protected function casts(): array
    {
        return [
            'business_date' => 'date:Y-m-d',
            'opening_cash' => 'decimal:2',
            'expected_cash' => 'decimal:2',
            'counted_cash' => 'decimal:2',
            'difference' => 'decimal:2',
            'summary' => 'array',
        ];
    }
}
