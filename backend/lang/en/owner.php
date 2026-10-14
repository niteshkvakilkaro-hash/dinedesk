<?php

/*
| The owner's daily summary (WhatsApp / email), in the owner's dashboard language.
| One file per language (config dinedesk.languages); English is the fallback.
| Keep every :placeholder as it is; ₹, GST and brand names stay in Latin, digits stay Western.
*/

return [
    'summary' => [
        'title' => ':business · summary for :date',
        'title_so_far' => ':business · today so far (:date, :time)',
        'sales' => 'Orders: :orders · Sales: ₹:amount',
        'no_orders' => 'No orders on this day.',
        'types' => [
            'dine_in' => 'Dine-in',
            'takeaway' => 'Takeaway',
            'delivery' => 'Delivery',
            'room_service' => 'Room service',
        ],
        'top' => 'Top dishes: :dishes',
        'bookings' => 'Table bookings: :count · guests: :guests',
        'hotel' => 'Rooms: :occupancy% occupied · check-ins today: :checkins',
        'low_stock' => 'Low stock (:count): :names',
        'link' => 'Full report: :url',
    ],
];
