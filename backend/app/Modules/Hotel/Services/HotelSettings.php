<?php

namespace App\Modules\Hotel\Services;

use App\Modules\Settings\Services\TenantSettings;

/**
 * How the hotel takes bookings, stored in tenant settings ("hotel").
 * Online booking, room service and guest ID uploads are all off until the owner turns them on.
 */
class HotelSettings
{
    public const KEY = 'hotel';

    public function __construct(private readonly TenantSettings $settings) {}

    public static function defaults(): array
    {
        return [
            // Rooms can be booked on the website.
            'online_booking' => false,
            // Off = website bookings wait for the front desk to confirm (unless an advance was paid online).
            'auto_confirm' => false,
            'check_in_time' => '12:00',
            'check_out_time' => '11:00',
            // Percent of the stay paid online when booking (0 = pay at the hotel). Needs Razorpay.
            'advance_percent' => 0,
            // An unpaid online booking holds the room this long.
            'hold_minutes' => 30,
            'max_nights' => 30,
            'max_days_ahead' => 365,
            // Guests can cancel online until this many days before check-in (0 = until the day before).
            'free_cancel_days' => 2,
            // Room tariff GST (5% up to ₹7,500 a night, 18% above). Off for a business not registered for GST.
            'charge_gst' => true,
            'house_rules' => null,
            'house_rules_hi' => null,
            // QR in each room opens the menu; orders are charged to the room.
            'room_service' => false,
            'banquets' => false,
            // Guest ID photos: off by default (privacy); kept this many days after check-out.
            'id_documents' => false,
            'id_keep_days' => 30,
        ];
    }

    public static function rules(): array
    {
        return [
            'online_booking' => ['required', 'boolean'],
            'auto_confirm' => ['required', 'boolean'],
            'check_in_time' => ['required', 'date_format:H:i'],
            'check_out_time' => ['required', 'date_format:H:i'],
            'advance_percent' => ['required', 'integer', 'in:0,10,20,25,30,50,100'],
            'hold_minutes' => ['required', 'integer', 'min:10', 'max:120'],
            'max_nights' => ['required', 'integer', 'min:1', 'max:90'],
            'max_days_ahead' => ['required', 'integer', 'min:7', 'max:540'],
            'free_cancel_days' => ['required', 'integer', 'min:0', 'max:60'],
            'charge_gst' => ['required', 'boolean'],
            'house_rules' => ['nullable', 'string', 'max:2000'],
            'house_rules_hi' => ['nullable', 'string', 'max:2000'],
            'room_service' => ['required', 'boolean'],
            'banquets' => ['required', 'boolean'],
            'id_documents' => ['required', 'boolean'],
            'id_keep_days' => ['required', 'integer', 'min:1', 'max:365'],
        ];
    }

    public function get(): array
    {
        return array_replace(self::defaults(), array_intersect_key((array) $this->settings->get(self::KEY, []), self::defaults()));
    }

    public function save(array $data): array
    {
        $clean = array_replace(self::defaults(), array_intersect_key($data, self::defaults()));
        foreach (['advance_percent', 'hold_minutes', 'max_nights', 'max_days_ahead', 'free_cancel_days', 'id_keep_days'] as $k) {
            $clean[$k] = (int) $clean[$k];
        }
        foreach (['online_booking', 'auto_confirm', 'charge_gst', 'room_service', 'banquets', 'id_documents'] as $k) {
            $clean[$k] = (bool) $clean[$k];
        }
        foreach (['house_rules', 'house_rules_hi'] as $k) {
            $clean[$k] = $clean[$k] ? trim(strip_tags((string) $clean[$k])) : null;
        }
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }
}
