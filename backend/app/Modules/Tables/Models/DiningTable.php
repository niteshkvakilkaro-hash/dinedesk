<?php

namespace App\Modules\Tables\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class DiningTable extends Model
{
    use BelongsToTenant, SoftDeletes;

    protected $fillable = ['tenant_id', 'label', 'seats', 'area', 'qr_token', 'is_active', 'sort_order'];

    protected $hidden = ['qr_token'];

    protected function casts(): array
    {
        return ['seats' => 'integer', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    protected static function booted(): void
    {
        static::creating(function (DiningTable $t) {
            $t->qr_token ??= self::newToken();
        });
    }

    /** Unguessable: knowing one table's QR must not reveal another's. */
    public static function newToken(): string
    {
        return Str::lower(Str::random(24));
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(TableSession::class);
    }

    public function openSession(): HasOne
    {
        return $this->hasOne(TableSession::class)->where('status', 'open')->latestOfMany();
    }

    public function requests(): HasMany
    {
        return $this->hasMany(TableRequest::class);
    }
}
