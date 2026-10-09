<?php

namespace App\Modules\Website\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class GalleryImage extends Model
{
    use BelongsToTenant;

    public const CATEGORIES = ['food', 'interior', 'events'];

    protected $fillable = ['tenant_id', 'image', 'alt_text', 'caption', 'category', 'sort_order', 'is_demo'];

    protected function casts(): array
    {
        return ['image' => 'array', 'sort_order' => 'integer', 'is_demo' => 'boolean'];
    }
}
