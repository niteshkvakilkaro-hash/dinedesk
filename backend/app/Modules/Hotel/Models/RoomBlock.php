<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** One room of a type held for some nights by a booking on another site (from its calendar). */
class RoomBlock extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'room_type_id', 'room_calendar_feed_id', 'uid', 'starts_on', 'ends_on', 'summary'];

    protected function casts(): array
    {
        return ['starts_on' => 'immutable_date', 'ends_on' => 'immutable_date'];
    }
}
