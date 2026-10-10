<?php

namespace App\Modules\Tables\Models;

use App\Modules\Ordering\Models\Order;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TableSession extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'dining_table_id', 'status', 'merged_into', 'opened_at', 'bill_requested_at', 'closed_at', 'closed_by', 'payment_mode', 'total'];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'bill_requested_at' => 'datetime',
            'closed_at' => 'datetime',
            'total' => 'decimal:2',
        ];
    }

    public function table(): BelongsTo
    {
        return $this->belongsTo(DiningTable::class, 'dining_table_id')->withTrashed();
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class)->orderBy('id');
    }
}
