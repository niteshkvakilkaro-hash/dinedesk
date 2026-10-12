<?php

namespace App\Modules\Marketing\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class AutomationSend extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'customer_id', 'kind', 'channel', 'sent_on'];

    protected function casts(): array
    {
        return ['sent_on' => 'date:Y-m-d'];
    }
}
