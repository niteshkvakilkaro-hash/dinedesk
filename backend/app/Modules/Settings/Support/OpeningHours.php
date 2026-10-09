<?php

namespace App\Modules\Settings\Support;

use Carbon\CarbonImmutable;

/**
 * Weekly opening hours: ['mon' => ['closed' => false, 'open' => '11:00', 'close' => '23:00'], ...].
 * A close time at or before the open time means service runs past midnight.
 * Holiday closures arrive in Phase 2.
 */
final class OpeningHours
{
    public const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

    /** @return array{is_open: bool, closes_at: ?string, opens_at: ?string, today: string, timezone: string} */
    public static function status(array $hours, string $timezone, ?CarbonImmutable $now = null): array
    {
        $now = ($now ?? CarbonImmutable::now())->setTimezone($timezone);
        $minutes = $now->hour * 60 + $now->minute;
        $today = strtolower($now->format('D'));
        $yesterday = strtolower($now->subDay()->format('D'));
        $m = fn (?string $t) => $t ? ((int) substr($t, 0, 2)) * 60 + (int) substr($t, 3, 2) : 0;

        $y = $hours[$yesterday] ?? null;
        if ($y && empty($y['closed']) && $m($y['close']) <= $m($y['open']) && $minutes < $m($y['close'])) {
            return ['is_open' => true, 'closes_at' => $y['close'], 'opens_at' => null, 'today' => $today, 'timezone' => $timezone];
        }

        $d = $hours[$today] ?? null;
        if ($d && empty($d['closed'])) {
            $open = $m($d['open']);
            $close = $m($d['close']);
            if ($minutes >= $open && ($close <= $open || $minutes < $close)) {
                return ['is_open' => true, 'closes_at' => $d['close'], 'opens_at' => null, 'today' => $today, 'timezone' => $timezone];
            }
            if ($minutes < $open) {
                return ['is_open' => false, 'closes_at' => null, 'opens_at' => $d['open'], 'today' => $today, 'timezone' => $timezone];
            }
        }

        return ['is_open' => false, 'closes_at' => null, 'opens_at' => null, 'today' => $today, 'timezone' => $timezone];
    }
}
