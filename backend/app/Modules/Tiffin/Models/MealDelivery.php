<?php

namespace App\Modules\Tiffin\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class MealDelivery extends Model
{
    use BelongsToTenant;

    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'meal_subscription_id', 'date', 'slot', 'status', 'user_id'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
