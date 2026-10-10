<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A physical room, with its housekeeping state and the QR code for in-room dining. */
class Room extends Model
{
    use BelongsToTenant, SoftDeletes;

    public const HOUSEKEEPING = ['clean', 'dirty', 'inspected', 'out_of_order'];

    protected $fillable = ['tenant_id', 'room_type_id', 'number', 'floor', 'housekeeping', 'housekeeping_note', 'housekeeping_at', 'qr_token', 'is_active', 'sort_order'];

    protected $hidden = ['qr_token'];

    protected function casts(): array
    {
        return ['housekeeping_at' => 'datetime', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(RoomType::class, 'room_type_id')->withTrashed();
    }

    /** Ready for a new guest. */
    public function isReady(): bool
    {
        return in_array($this->housekeeping, ['clean', 'inspected'], true);
    }
}
