<?php

namespace App\Modules\Menu\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AddonGroup extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'name_hi', 'min_select', 'max_select', 'sort_order', 'is_demo', 'translations'];

    protected function casts(): array
    {
        return ['min_select' => 'integer', 'max_select' => 'integer', 'sort_order' => 'integer', 'is_demo' => 'boolean', 'translations' => 'array'];
    }

    public function addons(): HasMany
    {
        return $this->hasMany(Addon::class)->orderBy('sort_order')->orderBy('id');
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(MenuItem::class, 'addon_group_menu_item')->withPivot('tenant_id', 'sort_order');
    }
}
