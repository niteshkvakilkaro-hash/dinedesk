<?php

namespace App\Modules\Notify\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A phone with the DineDesk Android app where someone is signed in: app notifications go to its
 * Firebase Cloud Messaging token. User-level (owners, staff, riders, super admins), so not
 * tenant-scoped: the user id is the boundary. A token belongs to whoever signed in on it last.
 */
class PushDevice extends Model
{
    protected $fillable = ['user_id', 'tenant_id', 'token', 'platform', 'app_flavor', 'app_version', 'locale', 'access_token_id', 'last_seen_at'];

    protected $hidden = ['token', 'access_token_id'];

    protected function casts(): array
    {
        return ['last_seen_at' => 'datetime'];
    }
}
