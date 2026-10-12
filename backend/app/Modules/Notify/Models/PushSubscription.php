<?php

namespace App\Modules\Notify\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** One browser / phone where a staff member turned on push alerts. */
class PushSubscription extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'user_id', 'endpoint', 'endpoint_hash', 'p256dh', 'auth', 'device'];

    protected $hidden = ['p256dh', 'auth'];
}
