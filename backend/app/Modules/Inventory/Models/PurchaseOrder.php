<?php

namespace App\Modules\Inventory\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    use BelongsToTenant;

    public const STATUSES = ['draft', 'sent', 'received', 'cancelled'];

    protected $fillable = ['tenant_id', 'supplier_id', 'number', 'status', 'expected_on', 'notes', 'total', 'sent_at', 'received_at', 'created_by'];

    protected function casts(): array
    {
        return ['expected_on' => 'date:Y-m-d', 'total' => 'decimal:2', 'sent_at' => 'datetime', 'received_at' => 'datetime'];
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseOrderLine::class);
    }

    public function code(): string
    {
        return 'PO-'.str_pad((string) $this->number, 4, '0', STR_PAD_LEFT);
    }
}
