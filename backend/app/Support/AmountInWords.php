<?php

namespace App\Support;

/** "Rupees One Thousand Two Hundred Thirty-Four and Fifty Paise Only" (Indian lakh / crore grouping). */
final class AmountInWords
{
    private const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    private const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    public static function rupees(int $paise): string
    {
        $rupees = intdiv(abs($paise), 100);
        $p = abs($paise) % 100;
        $words = 'Rupees '.($rupees ? self::number($rupees) : 'Zero');
        if ($p) {
            $words .= ' and '.self::number($p).' Paise';
        }

        return $words.' Only';
    }

    private static function number(int $n): string
    {
        $parts = [];
        foreach ([[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']] as [$size, $name]) {
            if ($n >= $size) {
                $parts[] = self::number(intdiv($n, $size)).' '.$name;
                $n %= $size;
            }
        }
        if ($n > 0) {
            $parts[] = $n < 20 ? self::ONES[$n] : self::TENS[intdiv($n, 10)].($n % 10 ? '-'.self::ONES[$n % 10] : '');
        }

        return implode(' ', $parts);
    }
}
