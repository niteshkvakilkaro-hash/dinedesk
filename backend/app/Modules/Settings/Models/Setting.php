<?php

namespace App\Modules\Settings\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'key', 'value'];

    protected function casts(): array
    {
        return ['value' => 'json'];
    }
}
