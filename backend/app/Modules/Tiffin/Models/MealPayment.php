<?php

namespace App\Modules\Tiffin\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class MealPayment extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    public const MODES = ['cash', 'upi', 'card', 'bank'];

    protected $fillable = ['tenant_id', 'meal_subscription_id', 'amount', 'mode', 'kind', 'user_id', 'paid_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'paid_at' => 'datetime'];
    }
}
