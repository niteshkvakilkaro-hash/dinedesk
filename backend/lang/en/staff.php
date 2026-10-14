<?php

/*
| Alerts to staff (web push on their phones), in each staff member's own dashboard language
| (users.locale). One file per language (config dinedesk.languages); English is the fallback.
| Keep every :placeholder as it is; order numbers, ₹ and brand names stay in Latin, digits stay Western.
*/

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'New order #:number · ₹:total',
        'for' => 'for :when',
        'types' => [
            'dine_in' => 'Dine-in',
            'takeaway' => 'Takeaway',
            'delivery' => 'Delivery',
            'room_service' => 'Room service',
        ],
    ],
    'reservation' => [
        'title' => 'Table booking · :name',
        'body' => ':count guests · :date at :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'Room booking · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'Event enquiry · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'Wedding',
            'birthday' => 'Birthday',
            'anniversary' => 'Anniversary',
            'corporate' => 'Corporate event',
            'other' => 'Other event',
        ],
    ],
    'tiffin' => [
        'title' => 'Tiffin request · :name',
        'body' => ':plan · from :date · :code',
        'default_plan' => 'Meal plan',
    ],
    'push_test' => 'Test alert: push notifications work on this device.',
];
