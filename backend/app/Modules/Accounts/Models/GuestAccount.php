<?php

namespace App\Modules\Accounts\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A guest who signed in on a business website with their phone (per business). */
class GuestAccount extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'phone', 'name', 'addresses'];

    protected function casts(): array
    {
        return ['addresses' => 'array'];
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(GuestSession::class);
    }
}
