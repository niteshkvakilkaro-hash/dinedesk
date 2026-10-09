<?php

namespace App\Modules\Ordering\Services;

use App\Modules\Ordering\Models\DeliveryZone;
use App\Support\ApiException;

/** Which delivery zone (and so which fee and minimum) covers an address. */
class DeliveryZones
{
    public function __construct(private readonly OrderingSettings $settings) {}

    public static function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'type' => ['required', 'in:pincode,radius'],
            'pincodes' => ['required_if:type,pincode', 'array', 'max:200'],
            'pincodes.*' => ['regex:/^[1-9]\d{5}$/', 'distinct'],
            'radius_km' => ['required_if:type,radius', 'nullable', 'numeric', 'min:0.5', 'max:50'],
            'fee' => ['required', 'numeric', 'min:0', 'max:2000'],
            'min_order' => ['required', 'numeric', 'min:0', 'max:100000'],
            'free_above' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /** Pincode zones first (they're explicit), then the smallest radius that covers the point. */
    public function resolve(?string $pincode, ?float $lat, ?float $lng): DeliveryZone
    {
        $zones = DeliveryZone::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        if ($pincode) {
            $match = $zones->first(fn ($z) => $z->type === 'pincode' && in_array($pincode, $z->pincodes ?? [], true));
            if ($match) {
                return $match;
            }
        }

        $origin = $this->settings->get()['location'];
        if ($lat !== null && $lng !== null && $origin['lat'] !== null && $origin['lng'] !== null) {
            $distance = self::distanceKm((float) $origin['lat'], (float) $origin['lng'], $lat, $lng);
            $match = $zones->filter(fn ($z) => $z->type === 'radius' && $distance <= (float) $z->radius_km)
                ->sortBy(fn ($z) => (float) $z->radius_km)->first();
            if ($match) {
                return $match;
            }
        }

        throw new ApiException(
            $pincode ? "Sorry, we don't deliver to {$pincode} yet. Takeaway may be available." : 'Enter your pincode to check delivery.',
            422,
            'outside_delivery_area',
            ['field' => 'address.pincode'],
        );
    }

    /** Great-circle distance (haversine). */
    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(min(1, sqrt($a)));
    }
}
