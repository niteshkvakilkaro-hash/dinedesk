<?php

namespace App\Modules\Staff\Models;

use App\Models\User;
use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attendance extends Model
{
    use BelongsToTenant;

    protected $table = 'attendance';

    protected $fillable = ['tenant_id', 'user_id', 'date', 'clock_in', 'clock_out', 'source', 'note'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'clock_in' => 'immutable_datetime', 'clock_out' => 'immutable_datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Minutes worked (so far, while still clocked in). */
    public function minutes(): int
    {
        return (int) max(0, $this->clock_in->diffInMinutes($this->clock_out ?? now(), true));
    }

    public function present(): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'date' => $this->date->format('Y-m-d'),
            'clock_in' => $this->clock_in->toIso8601String(),
            'clock_out' => $this->clock_out?->toIso8601String(),
            'minutes' => $this->minutes(),
            'source' => $this->source,
            'note' => $this->note,
        ];
    }
}
