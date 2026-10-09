<?php

namespace App\Modules\Website\Support;

/**
 * Server-side view of the theme registry (frontend: src/themes/registry.ts).
 * Adding a theme = one entry here + one folder on the frontend.
 *
 * Colours mirror each theme's tokens.ts so contrast warnings and SEO colours
 * work without the browser.
 */
final class Themes
{
    public const CATALOGUE = [
        'haveli' => ['primary' => '#641E16', 'accent' => '#C9A45C', 'background' => '#FFF8E9', 'text' => '#2B2118', 'accent_role' => 'fill'],
        'bistro' => ['primary' => '#B5532D', 'accent' => '#5B6B3A', 'background' => '#F6F3EE', 'text' => '#1E1D1B', 'accent_role' => 'ink'],
        'street' => ['primary' => '#D7261E', 'accent' => '#FFCB2E', 'background' => '#FFF9EC', 'text' => '#141414', 'accent_role' => 'fill'],
    ];

    /** Home page sections an owner can reorder or hide. The hero is always first. */
    public const SECTIONS = ['specials', 'story', 'menu_preview', 'gallery', 'hours', 'visit'];

    public const DEFAULT = 'haveli';

    public const HEX = '/^#[0-9A-Fa-f]{6}$/';

    public static function keys(): array
    {
        return array_keys(self::CATALOGUE);
    }

    public static function defaultSections(): array
    {
        return array_map(fn ($key) => ['key' => $key, 'visible' => true], self::SECTIONS);
    }

    /** Known keys only, each once, in the given order; missing keys appended as visible. */
    public static function normalizeSections(array $sections): array
    {
        $out = [];
        $seen = [];
        foreach ($sections as $s) {
            $key = $s['key'] ?? null;
            if (in_array($key, self::SECTIONS, true) && ! isset($seen[$key])) {
                $out[] = ['key' => $key, 'visible' => (bool) ($s['visible'] ?? true)];
                $seen[$key] = true;
            }
        }
        foreach (self::SECTIONS as $key) {
            if (! isset($seen[$key])) {
                $out[] = ['key' => $key, 'visible' => true];
            }
        }

        return $out;
    }

    /**
     * Contrast warnings (not errors: the owner decides, we tell them).
     * Primary carries white button text → needs 4.5:1 (AA normal text).
     * Accent depends on how the theme uses it:
     *  - "fill": a highlight with the theme's dark text on top → accent vs text ≥ 4.5
     *  - "ink":  small text/marks on the page background     → accent vs background ≥ 4.5
     *
     * @return list<array{field: string, ratio: float, required: float, message: string}>
     */
    public static function contrastWarnings(string $theme, ?string $primary, ?string $accent): array
    {
        $t = self::CATALOGUE[$theme];
        $warnings = [];
        if ($primary) {
            $ratio = Contrast::ratio($primary, '#FFFFFF');
            if ($ratio < 4.5) {
                $warnings[] = ['field' => 'primary_color', 'ratio' => round($ratio, 2), 'required' => 4.5,
                    'message' => 'White text on this primary colour is hard to read (below WCAG AA 4.5:1). Try a darker shade.'];
            }
        }
        if ($accent) {
            $fill = $t['accent_role'] === 'fill';
            $ratio = Contrast::ratio($accent, $fill ? $t['text'] : $t['background']);
            if ($ratio < 4.5) {
                $warnings[] = ['field' => 'accent_color', 'ratio' => round($ratio, 2), 'required' => 4.5,
                    'message' => $fill
                        ? 'Text on this accent colour is hard to read (below WCAG AA 4.5:1). Try a lighter shade.'
                        : 'This accent colour is hard to read on the page background (below WCAG AA 4.5:1). Try a darker shade.'];
            }
        }

        return $warnings;
    }
}
