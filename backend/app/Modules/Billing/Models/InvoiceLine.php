<?php

namespace App\Modules\Billing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class InvoiceLine extends Model
{
    use BelongsToTenant;

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'invoice_id', 'description', 'sac', 'quantity', 'unit_price', 'discount', 'taxable_value', 'tax_rate', 'cgst', 'sgst', 'total'];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'decimal:2',
            'discount' => 'decimal:2',
            'taxable_value' => 'decimal:2',
            'tax_rate' => 'decimal:2',
            'cgst' => 'decimal:2',
            'sgst' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }
}
