<?php

namespace App\Modules\DataExport\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/** A ZIP of everything a business has on the platform, kept for 7 days. */
class DataExport extends Model
{
    use BelongsToTenant, HasUlids;

    public const KEEP_DAYS = 7;

    protected $fillable = ['tenant_id', 'requested_by', 'status', 'path', 'size', 'error', 'expires_at'];

    protected $hidden = ['path'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'expires_at' => 'datetime'];
    }

    public function uniqueIds(): array
    {
        return ['public_id'];
    }
}
