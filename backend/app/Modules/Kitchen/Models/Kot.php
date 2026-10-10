<?php

namespace App\Modules\Kitchen\Models;

use App\Modules\Ordering\Models\Order;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Kitchen order ticket. */
class Kot extends Model
{
    use BelongsToTenant;

    public const ACTIVE = ['new', 'preparing', 'ready'];

    protected $fillable = ['tenant_id', 'order_id', 'number', 'status', 'order_type', 'table_label', 'notes', 'started_at', 'ready_at', 'served_at'];

    protected function casts(): array
    {
        return ['number' => 'integer', 'started_at' => 'datetime', 'ready_at' => 'datetime', 'served_at' => 'datetime'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(KotItem::class)->orderBy('id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
