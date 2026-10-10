<?php

namespace App\Modules\Kitchen\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KotItem extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'kot_id', 'order_item_id', 'name', 'variant_name', 'addons', 'food_type', 'quantity', 'notes', 'done'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'done' => 'boolean'];
    }

    public function kot(): BelongsTo
    {
        return $this->belongsTo(Kot::class);
    }
}
