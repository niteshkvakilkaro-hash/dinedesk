<?php

namespace App\Modules\Inventory\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'phone', 'email', 'gstin', 'notes', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
