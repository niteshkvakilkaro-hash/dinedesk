<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A booking site's calendar (iCal link) whose bookings block a room of this type. */
class RoomCalendarFeed extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'room_type_id', 'name', 'url', 'synced_at', 'error', 'events'];

    protected $hidden = ['url'];

    protected function casts(): array
    {
        return ['url' => 'encrypted', 'synced_at' => 'immutable_datetime', 'events' => 'integer'];
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(RoomType::class, 'room_type_id');
    }

    public function blocks(): HasMany
    {
        return $this->hasMany(RoomBlock::class);
    }
}
