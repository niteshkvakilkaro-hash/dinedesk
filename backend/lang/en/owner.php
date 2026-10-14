<?php

/*
| Messages to the owner (daily summary on WhatsApp / email, referral rewards), in the owner's
| dashboard language.
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
        'tiffin' => 'Tiffin: :active active · meals today: :lunch lunch, :dinner dinner',
        'tiffin_requests' => 'New tiffin requests: :count',
        'link' => 'Full report: :url',
    ],
    // Refer a business: a business that signed up with the owner's link started paying.
    'referral' => [
        'subject' => ':business joined with your link: :days free days for you',
        'paid' => ':business signed up with your referral link and has started a paid plan.',
        'applied_trial' => 'We have added :days free days to your trial. It now ends on :date.',
        'applied_period' => 'We have added :days free days. Your plan now runs until :date.',
        'pending' => 'Your plan renews automatically, so your :days free days are kept as credit for now. Our team will apply them, or they are added on their own if your plan stops renewing.',
        'thanks' => 'Thank you for recommending us!',
        'link' => 'Your referrals: :url',
    ],
];
