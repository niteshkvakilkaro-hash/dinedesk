<?php

namespace App\Modules\Accounts\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One signed-in browser. Only a hash of the token is stored. */
class GuestSession extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'guest_account_id', 'token_hash', 'expires_at', 'last_used_at'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'last_used_at' => 'datetime'];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(GuestAccount::class, 'guest_account_id');
    }
}
