<?php

namespace App\Support;

final class Phone
{
    /** "98290 12345", "+91-98290-12345", "09829012345" → "+919829012345"; unchanged if not an Indian mobile. */
    public static function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $value);
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }

        return preg_match('/^[6-9]\d{9}$/', $digits) ? '+91'.$digits : trim($value);
    }

    public const RULE = 'regex:/^\+91[6-9]\d{9}$/';

    public const MESSAGE = 'Enter a valid 10-digit Indian mobile number.';
}
