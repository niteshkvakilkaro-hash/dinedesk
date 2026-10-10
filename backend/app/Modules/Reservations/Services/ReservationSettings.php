<?php

namespace App\Modules\Reservations\Services;

use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;

/**
 * How a business takes table bookings, stored in tenant settings ("reservations").
 * Slot times and their capacity live in reservation_slots; when a business has
 * none yet, slots are derived from opening hours with default_capacity.
 */
class ReservationSettings
{
    public const KEY = 'reservations';

    public function __construct(private readonly TenantSettings $settings) {}

    public static function defaults(): array
    {
        return [
            // Off until the owner switches it on.
            'enabled' => false,
            // Off = every website booking waits for staff to accept it.
            'auto_confirm' => false,
            'slot_minutes' => 30,
            'duration_minutes' => 90,
            'default_capacity' => 20,
            'min_party' => 1,
            'max_party' => 10,
            // Bookings must be made at least this long before the time.
            'lead_minutes' => 60,
            'max_days' => 30,
            // Confirmed guests get a reminder this many hours before (0 = none).
            'reminder_hours' => 3,
            // Match each booking to a free table big enough (when tables are set up).
            'match_tables' => true,
            'blackout_dates' => [],
        ];
    }

    public static function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'auto_confirm' => ['required', 'boolean'],
            'slot_minutes' => ['required', 'integer', 'in:15,30,45,60'],
            'duration_minutes' => ['required', 'integer', 'min:30', 'max:300'],
            'default_capacity' => ['required', 'integer', 'min:1', 'max:500'],
            'min_party' => ['required', 'integer', 'min:1', 'max:50'],
            'max_party' => ['required', 'integer', 'min:1', 'max:100', 'gte:min_party'],
            'lead_minutes' => ['required', 'integer', 'min:0', 'max:2880'],
            'max_days' => ['required', 'integer', 'min:1', 'max:180'],
            'reminder_hours' => ['required', 'integer', 'min:0', 'max:48'],
            'match_tables' => ['required', 'boolean'],
            ...OpeningHours::holidayRules('blackout_dates'),
        ];
    }

    public function get(): array
    {
        return array_replace(self::defaults(), (array) $this->settings->get(self::KEY, []));
    }

    public function save(array $data): array
    {
        $clean = array_replace(self::defaults(), array_intersect_key($data, self::defaults()));
        foreach (['slot_minutes', 'duration_minutes', 'default_capacity', 'min_party', 'max_party', 'lead_minutes', 'max_days', 'reminder_hours'] as $k) {
            $clean[$k] = (int) $clean[$k];
        }
        foreach (['enabled', 'auto_confirm', 'match_tables'] as $k) {
            $clean[$k] = (bool) $clean[$k];
        }
        $clean['blackout_dates'] = OpeningHours::normalizeHolidays((array) $clean['blackout_dates']);
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }
}
