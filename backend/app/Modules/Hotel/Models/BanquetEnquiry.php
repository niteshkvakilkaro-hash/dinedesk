<?php

namespace App\Modules\Hotel\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

/** An event / banquet enquiry from the website, followed up by staff. */
class BanquetEnquiry extends Model
{
    use BelongsToTenant;

    public const EVENT_TYPES = ['wedding', 'birthday', 'anniversary', 'corporate', 'other'];

    public const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'lost'];

    protected $fillable = ['tenant_id', 'name', 'phone', 'email', 'event_type', 'event_date', 'guests', 'message', 'status', 'follow_up_on', 'notes', 'locale'];

    protected function casts(): array
    {
        return ['event_date' => 'date:Y-m-d', 'follow_up_on' => 'date:Y-m-d', 'guests' => 'integer', 'notes' => 'array'];
    }
}
