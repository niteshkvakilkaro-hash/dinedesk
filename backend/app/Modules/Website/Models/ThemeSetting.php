<?php

namespace App\Modules\Website\Models;

use App\Modules\Tenancy\Support\BelongsToTenant;
use App\Modules\Website\Support\Themes;
use Illuminate\Database\Eloquent\Model;

class ThemeSetting extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'theme', 'primary_color', 'accent_color', 'logo', 'cover', 'sections'];

    protected function casts(): array
    {
        return ['logo' => 'array', 'cover' => 'array', 'sections' => 'array'];
    }

    /** The current tenant's row, created with defaults on first use. */
    public static function current(): self
    {
        return static::firstOrCreate([], ['theme' => Themes::DEFAULT, 'sections' => Themes::defaultSections()]);
    }
}
