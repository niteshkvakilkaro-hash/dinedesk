<?php

namespace App\Modules\Hotel\Services;

use App\Modules\Hotel\Models\RoomRate;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Ordering\Support\Money;
use App\Support\ApiException;
use Carbon\CarbonImmutable;

/**
 * Price of a stay, night by night (all in paise internally):
 *  - a seasonal rate covering the night wins over the base price (the newest one if several);
 *  - Friday and Saturday nights use the weekend price when one is set;
 *  - extra adults above the included number, and children, add their nightly charge;
 *  - GST per night by the slab the night's room price falls in (config dinedesk.hotel_gst).
 */
class RoomPricing
{
    public const SAC_ACCOMMODATION = '996311';

    public const WEEKEND = [5, 6]; // Friday and Saturday nights (ISO day of week)

    public function __construct(private readonly HotelSettings $settings) {}

    /**
     * @return array{nights: int, rates: list<array{date: string, price: string, tax_rate: string, tax: string, season: ?string, weekend: bool}>, room_total: string, tax_total: string, total: string}
     */
    public function quote(RoomType $type, string $checkIn, string $checkOut, int $adults, int $children = 0): array
    {
        $this->checkGuests($type, $adults, $children);
        $in = CarbonImmutable::createFromFormat('!Y-m-d', $checkIn);
        $out = CarbonImmutable::createFromFormat('!Y-m-d', $checkOut);
        $nights = (int) $in->diffInDays($out);
        if ($nights < 1) {
            throw new ApiException('Check-out must be after check-in.', 422, 'invalid_dates', ['field' => 'check_out']);
        }

        $seasons = RoomRate::where('room_type_id', $type->id)
            ->where('starts_on', '<', $out->format('Y-m-d'))->where('ends_on', '>=', $in->format('Y-m-d'))
            ->orderByDesc('id')->get();
        $gst = (bool) $this->settings->get()['charge_gst'];
        $extraAdults = max(0, $adults - $type->base_occupancy);
        $extras = $extraAdults * Money::toPaise($type->extra_adult_price) + $children * Money::toPaise($type->extra_child_price);

        $rates = [];
        $sum = $tax = 0;
        for ($d = $in; $d->lt($out); $d = $d->addDay()) {
            $date = $d->format('Y-m-d');
            $weekend = in_array($d->dayOfWeekIso, self::WEEKEND, true);
            $season = $seasons->first(fn (RoomRate $r) => $r->starts_on->format('Y-m-d') <= $date && $r->ends_on->format('Y-m-d') >= $date);
            $base = $season
                ? ($weekend && $season->weekend_price !== null ? $season->weekend_price : $season->price)
                : ($weekend && $type->weekend_price !== null ? $type->weekend_price : $type->base_price);
            $price = Money::toPaise($base) + $extras;
            $rate = $gst ? self::gstRate($price) : 0;
            $nightTax = Money::taxOnTop($price, Money::rateBp($rate));
            $sum += $price;
            $tax += $nightTax;
            $rates[] = [
                'date' => $date,
                'price' => Money::toRupees($price),
                'tax_rate' => number_format($rate, 2, '.', ''),
                'tax' => Money::toRupees($nightTax),
                'season' => $season?->name,
                'weekend' => $weekend,
            ];
        }

        return [
            'nights' => $nights,
            'rates' => $rates,
            'room_total' => Money::toRupees($sum),
            'tax_total' => Money::toRupees($tax),
            'total' => Money::toRupees($sum + $tax),
        ];
    }

    /** GST rate (percent) for one room-night priced at $paise. */
    public static function gstRate(int $paise): float
    {
        foreach ((array) config('dinedesk.hotel_gst') as $slab) {
            if ($slab['up_to'] === null || $paise <= $slab['up_to'] * 100) {
                return (float) $slab['rate'];
            }
        }

        return 0.0;
    }

    /** Lowest nightly price of a type ("from ₹2,500"), before GST. */
    public static function fromPrice(RoomType $type): string
    {
        $prices = array_filter([Money::toPaise($type->base_price), $type->weekend_price !== null ? Money::toPaise($type->weekend_price) : null], fn ($p) => $p !== null);

        return Money::toRupees(min($prices));
    }

    public function checkGuests(RoomType $type, int $adults, int $children): void
    {
        if ($adults < 1 || $adults > $type->max_adults) {
            throw new ApiException("{$type->name} takes up to {$type->max_adults} adults.", 422, 'too_many_guests', ['field' => 'adults']);
        }
        if ($children < 0 || $children > $type->max_children) {
            throw new ApiException($type->max_children ? "{$type->name} takes up to {$type->max_children} children." : "{$type->name} is for adults only.", 422, 'too_many_guests', ['field' => 'children']);
        }
    }
}
