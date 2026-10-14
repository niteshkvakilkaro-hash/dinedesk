<?php

namespace App\Modules\Marketing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** Scheduled festive offer: top bar, popup or Offers-page card. */
class Banner extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'placement', 'title', 'title_hi', 'text', 'text_hi', 'cta_label', 'cta_link', 'coupon_code', 'starts_at', 'ends_at', 'is_active', 'sort_order', 'translations'];

    protected function casts(): array
    {
        return ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_active' => 'boolean', 'sort_order' => 'integer', 'translations' => 'array'];
    }
}
