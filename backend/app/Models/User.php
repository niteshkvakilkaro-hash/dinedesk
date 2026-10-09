<?php

namespace App\Models;

use App\Modules\Tenancy\Models\Tenant;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * A person who signs in: a super admin (is_platform_admin, no tenant), a
 * business owner/staff member (tenant_id set), or someone mid-onboarding
 * (tenant_id null). Customers are a separate model (Phase 3).
 *
 * Users are not globally tenant-scoped (sign-in must find them before a
 * tenant is known); every tenant-side query on users filters by tenant_id.
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    protected $fillable = ['tenant_id', 'name', 'email', 'phone', 'password', 'is_platform_admin', 'status', 'locale', 'email_verified_at', 'phone_verified_at', 'last_login_at'];

    protected $hidden = ['password', 'remember_token'];

    // Mirror the column defaults so a freshly created model is complete
    // without re-reading it from the database.
    protected $attributes = [
        'status' => 'active',
        'locale' => 'en',
        'is_platform_admin' => false,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'is_platform_admin' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** The user's role inside their own business (owner, manager, ...), or null. */
    public function tenantRole(): ?string
    {
        if (! $this->tenant_id) {
            return null;
        }

        return $this->withinOwnTenant(fn () => $this->roles()->first()?->name);
    }

    /** @return list<string> permission names inside the user's own business */
    public function tenantPermissions(): array
    {
        if (! $this->tenant_id) {
            return [];
        }

        return $this->withinOwnTenant(fn () => $this->getAllPermissions()->pluck('name')->values()->all());
    }

    /** Evaluate role/permission lookups with the spatie team set to this user's tenant. */
    private function withinOwnTenant(callable $callback): mixed
    {
        $previous = getPermissionsTeamId();
        setPermissionsTeamId($this->tenant_id);
        $this->unsetRelation('roles')->unsetRelation('permissions');
        try {
            return $callback();
        } finally {
            setPermissionsTeamId($previous);
            $this->unsetRelation('roles')->unsetRelation('permissions');
        }
    }
}
