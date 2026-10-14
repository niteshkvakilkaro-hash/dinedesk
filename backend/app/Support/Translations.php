<?php

namespace App\Support;

/**
 * Owner content in the site languages other than English and Hindi. Kept as
 * {"ta": {"name": "...", "description": "..."}, ...} next to the English fields
 * (Hindi has its own *_hi columns); missing or empty means "show English".
 */
final class Translations
{
    /** English names, for telling the AI which language to write. */
    public const NAMES = [
        'bn' => 'Bengali', 'mr' => 'Marathi', 'te' => 'Telugu', 'ta' => 'Tamil', 'gu' => 'Gujarati',
        'ur' => 'Urdu', 'kn' => 'Kannada', 'or' => 'Odia', 'ml' => 'Malayalam', 'pa' => 'Punjabi (Gurmukhi script)',
    ];

    /** @return list<string> the editable languages (every site language except en and hi) */
    public static function languages(): array
    {
        return array_values(array_diff(config('dinedesk.languages'), ['en', 'hi']));
    }

    /**
     * Only the known languages and fields, only non-empty text. An object, so an empty set is {} in JSON.
     *
     * @param  list<string>  $fields
     */
    public static function clean(mixed $translations, array $fields): object
    {
        $out = [];
        foreach (self::languages() as $lang) {
            foreach ($fields as $f) {
                $v = $translations[$lang][$f] ?? null;
                if (is_string($v) && trim($v) !== '') {
                    $out[$lang][$f] = $v;
                }
            }
        }

        return (object) $out;
    }

    /** One field set (or removed, when empty) in a translations array. */
    public static function put(?array $translations, string $lang, string $field, string $text): ?array
    {
        $t = $translations ?? [];
        if (trim($text) === '') {
            unset($t[$lang][$field]);
            if (empty($t[$lang])) {
                unset($t[$lang]);
            }
        } else {
            $t[$lang][$field] = trim($text);
        }

        return $t ?: null;
    }
}
