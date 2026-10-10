<?php

namespace App\Modules\Ordering\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id', 'name', 'phone', 'email', 'orders_count', 'last_order_at', 'total_spent', 'visits', 'loyalty_points',
        'birthday', 'anniversary', 'dates_opt_in', 'marketing_opt_in', 'marketing_opt_in_at', 'tags', 'notes', 'unsubscribe_token',
    ];

    protected function casts(): array
    {
        return [
            'orders_count' => 'integer', 'last_order_at' => 'datetime', 'total_spent' => 'decimal:2', 'visits' => 'integer',
            'loyalty_points' => 'integer', 'birthday' => 'date:Y-m-d', 'anniversary' => 'date:Y-m-d', 'dates_opt_in' => 'boolean',
            'marketing_opt_in' => 'boolean', 'marketing_opt_in_at' => 'datetime', 'tags' => 'array',
        ];
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }
}
