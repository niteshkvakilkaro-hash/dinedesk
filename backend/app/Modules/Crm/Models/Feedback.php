<?php

namespace App\Modules\Crm\Models;

use App\Modules\Ordering\Models\Order;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A guest's rating after an order; published on the website only with their consent. */
class Feedback extends Model
{
    use BelongsToTenant;

    protected $table = 'feedback';

    public $timestamps = false;

    protected $fillable = ['tenant_id', 'order_id', 'customer_id', 'rating', 'food', 'service', 'comment', 'name', 'consent_public', 'is_published', 'reply', 'created_at'];

    protected function casts(): array
    {
        return ['rating' => 'integer', 'food' => 'integer', 'service' => 'integer', 'consent_public' => 'boolean', 'is_published' => 'boolean', 'created_at' => 'datetime'];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
