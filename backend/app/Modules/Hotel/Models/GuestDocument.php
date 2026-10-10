<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** A guest's ID document: stored encrypted on the private disk, every access audited. */
class GuestDocument extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'room_booking_id', 'doc_type', 'path', 'mime', 'size', 'uploaded_by', 'delete_after'];

    protected $hidden = ['path'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'delete_after' => 'date:Y-m-d'];
    }
}
