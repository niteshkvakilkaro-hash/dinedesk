<?php

namespace App\Modules\Reservations\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ReservationSlot extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'day', 'time', 'capacity', 'is_active'];

    protected function casts(): array
    {
        return ['capacity' => 'integer', 'is_active' => 'boolean'];
    }
}
