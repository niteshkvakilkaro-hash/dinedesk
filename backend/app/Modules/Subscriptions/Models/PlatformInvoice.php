<?php

namespace App\Modules\Subscriptions\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

/** A tax invoice the platform issues to a business for its subscription. */
class PlatformInvoice extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id', 'subscription_id', 'number', 'financial_year', 'sequence', 'plan_code', 'billing_cycle', 'period_start', 'period_end',
        'seller', 'buyer', 'sac', 'taxable_value', 'gst_rate', 'cgst', 'sgst', 'igst', 'total', 'provider_payment_id', 'issued_at',
    ];

    protected function casts(): array
    {
        return [
            'seller' => 'array',
            'buyer' => 'array',
            'period_start' => 'date:Y-m-d',
            'period_end' => 'date:Y-m-d',
            'taxable_value' => 'decimal:2',
            'gst_rate' => 'decimal:2',
            'cgst' => 'decimal:2',
            'sgst' => 'decimal:2',
            'igst' => 'decimal:2',
            'total' => 'decimal:2',
            'issued_at' => 'datetime',
            'sequence' => 'integer',
        ];
    }

    public function uniqueIds(): array
    {
        return ['public_id'];
    }
}
