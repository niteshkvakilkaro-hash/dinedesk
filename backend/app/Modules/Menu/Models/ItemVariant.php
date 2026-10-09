<?php

namespace App\Modules\Menu\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ItemVariant extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'menu_item_id', 'name', 'name_hi', 'price', 'is_default', 'is_available', 'sort_order'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'is_default' => 'boolean', 'is_available' => 'boolean', 'sort_order' => 'integer'];
    }
}
