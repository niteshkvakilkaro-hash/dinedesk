<?php

namespace App\Modules\Tables\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TableRequest extends Model
{
    use BelongsToTenant;

    public const TYPES = ['waiter', 'bill'];

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'dining_table_id', 'table_session_id', 'type', 'created_at', 'resolved_at', 'resolved_by'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id')->withTrashed();
    }
}
