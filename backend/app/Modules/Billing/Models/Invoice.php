<?php

namespace App\Modules\Billing\Models;

use App\Modules\Ordering\Models\Order;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    use BelongsToTenant, HasUlids;

    protected $fillable = [
        'tenant_id', 'number', 'financial_year', 'sequence', 'table_session_id', 'room_booking_id', 'kind', 'status', 'seller', 'buyer',
        'items_total', 'discount', 'discount_reason', 'taxable_value', 'cgst', 'sgst', 'charges', 'round_off', 'total', 'paid',
        'prices_include_tax', 'void_reason', 'created_by', 'issued_at', 'business_date',
    ];

    protected function casts(): array
    {
        return [
            'seller' => 'array',
            'buyer' => 'array',
            'items_total' => 'decimal:2',
            'discount' => 'decimal:2',
            'taxable_value' => 'decimal:2',
            'cgst' => 'decimal:2',
            'sgst' => 'decimal:2',
            'charges' => 'decimal:2',
            'round_off' => 'decimal:2',
            'total' => 'decimal:2',
            'paid' => 'decimal:2',
            'prices_include_tax' => 'boolean',
            'issued_at' => 'datetime',
            'business_date' => 'date:Y-m-d',
            'sequence' => 'integer',
        ];
    }

    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(BillPayment::class)->orderBy('id');
    }

    public function orders(): BelongsToMany
    {
        return $this->belongsToMany(Order::class, 'invoice_order')->orderBy('orders.id');
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(TableSession::class, 'table_session_id');
    }
}
