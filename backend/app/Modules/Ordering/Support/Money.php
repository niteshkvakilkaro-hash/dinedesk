<?php

namespace App\Modules\Ordering\Support;

/**
 * Money is calculated in paise (integers) so totals never drift by a paisa.
 * Rounding is half-up, per line.
 */
final class Money
{
    public static function toPaise(string|int|float|null $rupees): int
    {
        if ($rupees === null || $rupees === '') {
            return 0;
        }
        // Via string to avoid float artefacts ("12.30" → 1230).
        $s = is_string($rupees) ? trim($rupees) : number_format((float) $rupees, 2, '.', '');
        $negative = str_starts_with($s, '-');
        [$whole, $fraction] = array_pad(explode('.', ltrim($s, '-'), 2), 2, '0');
        $paise = (int) $whole * 100 + (int) str_pad(substr($fraction, 0, 2), 2, '0');

        return $negative ? -$paise : $paise;
    }

    public static function toRupees(int $paise): string
    {
        $sign = $paise < 0 ? '-' : '';
        $paise = abs($paise);

        return $sign.intdiv($paise, 100).'.'.str_pad((string) ($paise % 100), 2, '0', STR_PAD_LEFT);
    }

    /** round(a / b) half-up for non-negative integers. */
    public static function divRound(int $a, int $b): int
    {
        return intdiv(2 * $a + $b, 2 * $b);
    }

    /** Rate in percent (e.g. 5 or 12.5) as hundredths of a percent (500, 1250). */
    public static function rateBp(string|int|float $rate): int
    {
        return self::toPaise($rate);
    }

    /** GST on a tax-exclusive amount. */
    public static function taxOnTop(int $amount, int $rateBp): int
    {
        return self::divRound($amount * $rateBp, 10000);
    }

    /** GST contained in a tax-inclusive amount. */
    public static function taxWithin(int $amount, int $rateBp): int
    {
        return self::divRound($amount * $rateBp, 10000 + $rateBp);
    }
}
