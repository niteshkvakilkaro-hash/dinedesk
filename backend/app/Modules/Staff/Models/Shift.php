<?php

namespace App\Modules\Staff\Models;

use App\Models\User;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Shift extends Model
{
    use BelongsToTenant;

    protected $table = 'staff_shifts';

    protected $fillable = ['tenant_id', 'user_id', 'date', 'starts', 'ends', 'note'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function present(): array
    {
        return ['id' => $this->id, 'user_id' => $this->user_id, 'date' => $this->date->format('Y-m-d'), 'starts' => $this->starts, 'ends' => $this->ends, 'note' => $this->note];
    }
}
