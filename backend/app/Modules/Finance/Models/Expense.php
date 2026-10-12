<?php

namespace App\Modules\Finance\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Expense extends Model
{
    use BelongsToTenant;

    public const CATEGORIES = ['rent', 'salaries', 'utilities', 'gas', 'supplies', 'marketing', 'maintenance', 'other'];

    public const MODES = ['cash', 'upi', 'card', 'bank'];

    protected $fillable = ['tenant_id', 'date', 'category', 'amount', 'payment_mode', 'note', 'user_id'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'amount' => 'decimal:2'];
    }
}
