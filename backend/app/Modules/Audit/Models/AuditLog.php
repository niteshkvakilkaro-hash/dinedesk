<?php

namespace App\Modules\Audit\Models;

use App\Models\User;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only record of sensitive actions. Not globally scoped: platform
 * entries have no tenant. Tenant-side readers must filter by tenant_id.
 */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'user_id', 'action', 'subject_type', 'subject_id', 'meta', 'ip'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function record(string $action, ?Model $subject = null, array $meta = [], ?int $tenantId = null): self
    {
        return static::create([
            'tenant_id' => $tenantId ?? app(TenantContext::class)->id(),
            'user_id' => auth()->id(),
            'action' => $action,
            'subject_type' => $subject ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),
            'meta' => $meta ?: null,
            'ip' => request()?->ip(),
        ]);
    }
}
