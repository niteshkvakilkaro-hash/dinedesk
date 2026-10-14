<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A kind of room the hotel sells (Deluxe, Suite...), priced per night before GST. */
class RoomType extends Model
{
    use BelongsToTenant, SoftDeletes;

    /** Amenities a room type can list (labels live in the frontend translations). */
    public const AMENITIES = ['ac', 'wifi', 'tv', 'breakfast', 'geyser', 'balcony', 'view', 'minibar', 'kettle', 'workdesk', 'bathtub', 'room_service', 'parking', 'wheelchair', 'non_smoking', 'pet_friendly'];

    public const MAX_PHOTOS = 8;

    protected $fillable = [
        'tenant_id', 'slug', 'name', 'name_hi', 'description', 'description_hi', 'photos', 'amenities', 'bed', 'size_sqft',
        'base_occupancy', 'max_adults', 'max_children', 'base_price', 'weekend_price', 'extra_adult_price', 'extra_child_price', 'sort_order', 'is_active', 'translations',
    ];

    protected function casts(): array
    {
        return [
            'photos' => 'array',
            'amenities' => 'array',
            'size_sqft' => 'integer',
            'base_occupancy' => 'integer',
            'max_adults' => 'integer',
            'max_children' => 'integer',
            'base_price' => 'decimal:2',
            'weekend_price' => 'decimal:2',
            'extra_adult_price' => 'decimal:2',
            'extra_child_price' => 'decimal:2',
            'sort_order' => 'integer',
            'is_active' => 'boolean',
            'translations' => 'array',
        ];
    }

    public function rooms(): HasMany
    {
        return $this->hasMany(Room::class)->orderBy('sort_order')->orderBy('number');
    }

    public function rates(): HasMany
    {
        return $this->hasMany(RoomRate::class)->orderBy('starts_on');
    }
}
