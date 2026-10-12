<?php

namespace App\Modules\Tiffin\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MealSubscription extends Model
{
    use BelongsToTenant;

    public const OPEN = ['requested', 'active', 'paused'];

    protected $fillable = [
        'tenant_id', 'number', 'meal_plan_id', 'customer_id', 'name', 'phone', 'address', 'slot', 'status',
        'starts_on', 'ends_on', 'paused_on', 'meals_total', 'meals_used', 'amount_paid', 'notes', 'source',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'immutable_date', 'ends_on' => 'immutable_date', 'paused_on' => 'immutable_date',
            'meals_total' => 'integer', 'meals_used' => 'integer', 'amount_paid' => 'decimal:2', 'number' => 'integer',
        ];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(MealPlan::class, 'meal_plan_id');
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(MealDelivery::class);
    }

    public function code(): string
    {
        return 'T-'.str_pad((string) $this->number, 4, '0', STR_PAD_LEFT);
    }

    public function remaining(): int
    {
        return max(0, $this->meals_total - $this->meals_used);
    }

    /** The slots this subscriber gets: lunch, dinner or both. */
    public function slots(): array
    {
        return $this->slot === 'both' ? ['lunch', 'dinner'] : [$this->slot];
    }
}
