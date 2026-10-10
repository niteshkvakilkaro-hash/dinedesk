<?php

namespace App\Modules\Marketing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** A message sent to opted-in customers. */
class Campaign extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'channel', 'message', 'audience', 'recipients', 'status', 'created_by', 'sent_at'];

    protected function casts(): array
    {
        return ['audience' => 'array', 'recipients' => 'integer', 'sent_at' => 'datetime'];
    }
}
