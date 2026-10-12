<?php

namespace App\Modules\Tiffin\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class MealPlan extends Model
{
    use BelongsToTenant;

    public const SLOTS = ['lunch', 'dinner', 'both'];

    protected $fillable = ['tenant_id', 'name', 'description', 'diet', 'slot', 'meals', 'days_valid', 'price', 'is_active', 'sort'];

    protected function casts(): array
    {
        return ['meals' => 'integer', 'days_valid' => 'integer', 'price' => 'decimal:2', 'is_active' => 'boolean', 'sort' => 'integer'];
    }

    public function present(): array
    {
        return $this->only(['id', 'name', 'description', 'diet', 'slot', 'meals', 'days_valid', 'price', 'is_active', 'sort']);
    }
}
