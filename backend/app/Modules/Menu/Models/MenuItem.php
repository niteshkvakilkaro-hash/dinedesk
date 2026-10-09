<?php

namespace App\Modules\Menu\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class MenuItem extends Model
{
    use BelongsToTenant, SoftDeletes;

    public const FOOD_TYPES = ['veg', 'non_veg', 'egg'];

    public const ALLERGENS = ['gluten', 'dairy', 'nuts', 'peanuts', 'soy', 'egg', 'fish', 'shellfish', 'sesame', 'mustard'];

    protected $fillable = [
        'tenant_id', 'menu_category_id', 'name', 'name_hi', 'description', 'description_hi', 'price', 'tax_rate',
        'food_type', 'spice_level', 'allergens', 'is_available', 'is_bestseller', 'is_chefs_special',
        'image', 'sort_order', 'is_demo',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'spice_level' => 'integer',
            'allergens' => 'array',
            'is_available' => 'boolean',
            'is_bestseller' => 'boolean',
            'is_chefs_special' => 'boolean',
            'image' => 'array',
            'sort_order' => 'integer',
            'is_demo' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(MenuCategory::class, 'menu_category_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ItemVariant::class)->orderBy('sort_order')->orderBy('id');
    }

    public function addonGroups(): BelongsToMany
    {
        return $this->belongsToMany(AddonGroup::class, 'addon_group_menu_item')->withPivot('tenant_id', 'sort_order')->orderByPivot('sort_order');
    }
}
