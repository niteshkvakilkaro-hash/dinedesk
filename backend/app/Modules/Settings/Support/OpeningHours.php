<?php

namespace App\Modules\Settings\Support;

use Carbon\CarbonImmutable;

/**
 * Weekly opening hours: ['mon' => ['closed' => false, 'open' => '11:00', 'close' => '23:00'], ...].
 * A close time at or before the open time means service runs past midnight.
 * Holidays are whole-day closures: [['date' => '2026-11-08', 'label' => 'Diwali'], ...].
 */
final class OpeningHours
{
    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    public const MAX_HOLIDAYS = 60;

    public static function default(): array
    {
        return array_fill_keys(self::DAYS, ['closed' => false, 'open' => '11:00', 'close' => '23:00']);
    }

    /** Validation rules for an opening_hours payload under the given prefix. */
    public static function rules(string $prefix = 'opening_hours'): array
    {
        $rules = [$prefix => ['required', 'array']];
        foreach (self::DAYS as $day) {
            $rules["{$prefix}.{$day}"] = ['required', 'array'];
            $rules["{$prefix}.{$day}.closed"] = ['required', 'boolean'];
            $rules["{$prefix}.{$day}.open"] = ["exclude_if:{$prefix}.{$day}.closed,true", 'required', 'date_format:H:i'];
            $rules["{$prefix}.{$day}.close"] = ["exclude_if:{$prefix}.{$day}.closed,true", 'required', 'date_format:H:i', "different:{$prefix}.{$day}.open"];
        }

        return $rules;
    }

    public static function holidayRules(string $prefix = 'holidays'): array
    {
        return [
            $prefix => ['present', 'array', 'max:'.self::MAX_HOLIDAYS],
            "{$prefix}.*.date" => ['required', 'date_format:Y-m-d', 'distinct'],
            "{$prefix}.*.label" => ['nullable', 'string', 'max:60'],
        ];
    }

    /** Keeps only the known days/fields in a fixed order. */
    public static function normalize(array $hours): array
    {
        $out = [];
        foreach (self::DAYS as $day) {
            $closed = (bool) ($hours[$day]['closed'] ?? false);
            $out[$day] = [
                'closed' => $closed,
                'open' => $closed ? null : ($hours[$day]['open'] ?? null),
                'close' => $closed ? null : ($hours[$day]['close'] ?? null),
            ];
        }

        return $out;
    }

    /** Sorted by date, labels stripped of markup. */
    public static function normalizeHolidays(array $holidays): array
    {
        $out = array_map(fn ($h) => [
            'date' => (string) $h['date'],
            'label' => isset($h['label']) && $h['label'] !== '' ? strip_tags((string) $h['label']) : null,
        ], $holidays);
        usort($out, fn ($a, $b) => strcmp($a['date'], $b['date']));

        return array_values($out);
    }

    /** Holidays from today (in the business's timezone) onwards. */
    public static function upcomingHolidays(array $holidays, string $timezone, ?CarbonImmutable $now = null, int $limit = 10): array
    {
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->format('Y-m-d');

        return array_slice(array_values(array_filter($holidays, fn ($h) => $h['date'] >= $today)), 0, $limit);
    }

    /**
     * @return array{is_open: bool, closes_at: ?string, opens_at: ?string, today: string, timezone: string, holiday: ?array}
     */
    public static function status(array $hours, string $timezone, ?CarbonImmutable $now = null, array $holidays = []): array
    {
        $now = ($now ?? CarbonImmutable::now())->setTimezone($timezone);
        $minutes = $now->hour * 60 + $now->minute;
        $today = strtolower($now->format('D'));
        $yesterday = strtolower($now->subDay()->format('D'));
        $m = fn (?string $t) => $t ? ((int) substr($t, 0, 2)) * 60 + (int) substr($t, 3, 2) : 0;

        $holidayOn = function (CarbonImmutable $day) use ($holidays): ?array {
            $date = $day->format('Y-m-d');
            foreach ($holidays as $h) {
                if (($h['date'] ?? null) === $date) {
                    return ['date' => $date, 'label' => $h['label'] ?? null];
                }
            }

            return null;
        };
        $result = fn (bool $open, ?string $closes = null, ?string $opens = null, ?array $holiday = null) => [
            'is_open' => $open, 'closes_at' => $closes, 'opens_at' => $opens,
            'today' => $today, 'timezone' => $timezone, 'holiday' => $holiday,
        ];

        // Last night's late service still counts, unless last night was a holiday closure.
        $y = $hours[$yesterday] ?? null;
        if ($y && empty($y['closed']) && ! $holidayOn($now->subDay()) && $m($y['close']) <= $m($y['open']) && $minutes < $m($y['close'])) {
            return $result(true, $y['close']);
        }

        if ($holiday = $holidayOn($now)) {
            return $result(false, null, null, $holiday);
        }

        $d = $hours[$today] ?? null;
        if ($d && empty($d['closed'])) {
            $open = $m($d['open']);
            $close = $m($d['close']);
            if ($minutes >= $open && ($close <= $open || $minutes < $close)) {
                return $result(true, $d['close']);
            }
            if ($minutes < $open) {
                return $result(false, null, $d['open']);
            }
        }

        return $result(false);
    }
}
