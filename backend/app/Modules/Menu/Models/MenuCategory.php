<?php

namespace App\Modules\Menu\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MenuCategory extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'name_hi', 'slug', 'sort_order', 'is_active', 'is_demo'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer', 'is_active' => 'boolean', 'is_demo' => 'boolean'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(MenuItem::class)->orderBy('sort_order')->orderBy('id');
    }
}
