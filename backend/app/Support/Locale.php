<?php

namespace App\Support;

/** The guest's language for messages, from the X-Locale header ("ta", "bn-IN" ...). */
final class Locale
{
    /** A supported language code (config dinedesk.languages), or 'en'. */
    public static function guest(?string $value): string
    {
        $base = strtolower(explode('-', str_replace('_', '-', trim((string) $value)))[0]);

        return in_array($base, config('dinedesk.languages'), true) ? $base : 'en';
    }
}
