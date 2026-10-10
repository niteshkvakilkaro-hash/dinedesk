<?php

namespace App\Modules\Platform\Models;

use App\Models\User;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A super admin opening a business for support: reason, time limit, read-only by default. */
class SupportSession extends Model
{
    public const MINUTES = 60;

    protected $fillable = ['admin_id', 'tenant_id', 'token_id', 'reason', 'read_only', 'ip', 'expires_at', 'ended_at'];

    protected function casts(): array
    {
        return ['read_only' => 'boolean', 'expires_at' => 'datetime', 'ended_at' => 'datetime'];
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isOpen(): bool
    {
        return ! $this->ended_at && $this->expires_at->isFuture();
    }
}
