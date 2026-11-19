<?php

namespace App\Modules\Platform\Models;

use App\Models\User;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One conversation with the NikoBite assistant: messages = [{role: visitor|bot, text, at}]. */
class SupportChat extends Model
{
    use HasUlids;

    public const STATUSES = ['new', 'seen', 'closed'];

    protected $fillable = ['tenant_id', 'user_id', 'visitor_name', 'visitor_phone', 'page', 'messages', 'status', 'ip', 'last_message_at'];

    protected function casts(): array
    {
        return ['messages' => 'array', 'last_message_at' => 'datetime'];
    }

    public function uniqueIds(): array
    {
        return ['public_id'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
