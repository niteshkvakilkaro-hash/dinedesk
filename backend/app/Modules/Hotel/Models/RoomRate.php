<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** A seasonal price for a room type between two dates (inclusive). */
class RoomRate extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'room_type_id', 'name', 'starts_on', 'ends_on', 'price', 'weekend_price'];

    protected function casts(): array
    {
        return ['starts_on' => 'date:Y-m-d', 'ends_on' => 'date:Y-m-d', 'price' => 'decimal:2', 'weekend_price' => 'decimal:2'];
    }
}
