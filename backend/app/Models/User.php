<?php

namespace App\Models;

use App\Modules\Identity\Support\Roles;
use App\Modules\Platform\Models\SupportSession;
use App\Modules\Tenancy\Models\Tenant;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;
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

    private ?SupportSession $support = null;

    private bool $supportChecked = false;

    /** An open support session, when a super admin is signed in with a support token. */
    public function supportSession(): ?SupportSession
    {
        if ($this->supportChecked) {
            return $this->support;
        }
        $this->supportChecked = true;
        $token = $this->currentAccessToken();
        if (! $this->is_platform_admin || ! $token instanceof PersonalAccessToken || $token->name !== 'support') {
            return null;
        }
        $session = SupportSession::with('tenant')->where('token_id', $token->id)->first();

        return $this->support = $session && $session->isOpen() ? $session : null;
    }

    /** In a support session the admin works inside that business (in memory only, never saved). */
    public function enterSupport(SupportSession $session): void
    {
        $this->setRawAttributes(array_merge($this->getAttributes(), ['tenant_id' => $session->tenant_id]), true);
        $this->setRelation('tenant', $session->tenant);
    }

    /** The user's role inside their own business (owner, manager, ...), or null. */
    public function tenantRole(): ?string
    {
        if (! $this->tenant_id) {
            return null;
        }
        if ($this->supportSession()) {
            return 'owner';
        }

        return $this->withinOwnTenant(fn () => $this->roles()->first()?->name);
    }

    /** @return list<string> permission names inside the user's own business */
    public function tenantPermissions(): array
    {
        if (! $this->tenant_id) {
            return [];
        }
        // Support sees everything the owner sees (writes are refused in a read-only session).
        if ($this->supportSession()) {
            return Roles::PERMISSIONS;
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
