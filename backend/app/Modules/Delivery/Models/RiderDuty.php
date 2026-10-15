<?php

namespace App\Modules\Delivery\Models;

use App\Models\User;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A rider's time on duty: their location is recorded only between started_at and ended_at. */
class RiderDuty extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'user_id', 'started_at', 'ended_at'];

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime', 'ended_at' => 'immutable_datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
