<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use DateTimeInterface;
use Normalizer;

/**
 * Dates and times in a message recipient's language ("Wed 11 Nov, 7:00 PM" → "புதன் 11 நவம்பர், 7:00 மாலை").
 * Carbon ships translations for all 12 dashboard/site languages (including Odia); unsupported codes fall
 * back to English. Digits always stay Western (0-9), even if a locale would print native digits.
 */
final class LocalDate
{
    /** Native digit sets (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Arabic-Indic, Extended Arabic-Indic). */
    private const DIGIT_ZEROS = [0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66, 0x0660, 0x06F0];

    /**
     * @param  string  $pattern  ISO pattern (Carbon isoFormat), e.g. "ddd D MMM, h:mm A".
     */
    public static function format(DateTimeInterface|string $date, string $pattern, ?string $locale, ?string $timezone = null): string
    {
        $d = CarbonImmutable::parse($date);
        if ($timezone) {
            $d = $d->setTimezone($timezone);
        }
        $code = Locale::guest($locale);
        $text = $d->locale($code === 'en' ? 'en_IN' : $code)->isoFormat($pattern);

        $text = self::westernDigits(trim((string) preg_replace('/\s+/u', ' ', $text)));

        // Composed letters (some of Carbon's Tamil names use decomposed vowel signs), so they match the message text.
        return Normalizer::normalize($text, Normalizer::FORM_C) ?: $text;
    }

    /** "१२" → "12". */
    public static function westernDigits(string $text): string
    {
        $map = [];
        foreach (self::DIGIT_ZEROS as $zero) {
            for ($i = 0; $i < 10; $i++) {
                $map[mb_chr($zero + $i, 'UTF-8')] = (string) $i;
            }
        }

        return strtr($text, $map);
    }
}
