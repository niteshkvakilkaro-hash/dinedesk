<?php

namespace App\Modules\Delivery\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** One position of a rider's phone while on duty. */
class RiderLocation extends Model
{
    use BelongsToTenant;

    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'user_id', 'lat', 'lng', 'accuracy_m', 'speed', 'heading', 'battery', 'recorded_at'];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'accuracy_m' => 'integer',
            'speed' => 'float',
            'heading' => 'integer',
            'battery' => 'integer',
            'recorded_at' => 'immutable_datetime',
        ];
    }

    public function present(): array
    {
        return [
            'lat' => $this->lat,
            'lng' => $this->lng,
            'accuracy_m' => $this->accuracy_m,
            'battery' => $this->battery,
            'at' => $this->recorded_at->toIso8601String(),
        ];
    }
}
