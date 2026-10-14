<?php

/*
| Messages to guests (WhatsApp / SMS / email) about their orders and bookings.
| One file per language (config dinedesk.languages); English is the fallback.
| Keep every :placeholder as it is. "party" and "nights" are counts (trans_choice).
*/

return [
    'order' => [
        'placed' => ':business: we have received your order #:number (₹:total). Track it here: :url',
        'confirmed' => ':business has confirmed your order #:number. Track it: :url',
        'ready_takeaway' => 'Your order #:number from :business is ready for pickup.',
        'ready_dine_in' => 'Your order #:number from :business is ready.',
        'out_for_delivery' => 'Your order #:number from :business is out for delivery. Track it: :url',
        'completed' => 'Thank you for ordering from :business! Order #:number is complete.',
        'cancelled' => 'Sorry, :business had to cancel your order #:number. Reason: :reason',
        'subject' => ':business — order #:number',
        'button' => 'View your order',
    ],

    'reservation' => [
        'received' => ':business: we have received your table request for :party on :when. Booking ID :code. We will confirm it soon: :url',
        'confirmed' => ':business: your table for :party on :when is confirmed. Booking ID :code. Manage it here: :url',
        'rejected' => 'Sorry, :business cannot take your booking for :when (booking ID :code).:reason',
        'cancelled' => 'Your booking at :business for :when (booking ID :code) has been cancelled.:reason',
        'reminder' => 'Reminder: your table at :business for :party is booked for :when. Booking ID :code. Need to cancel? :url',
        'party' => '{1} :count guest|[2,*] :count guests',
        'subject' => ':business — booking :code',
        'button' => 'View your booking',
    ],

    'stay' => [
        'received' => ':business: we have received your room request for :dates (:nights). Booking ID :code. We will confirm it soon: :url',
        'confirmed' => ':business: your room for :dates (:nights) is confirmed. Booking ID :code. Check-in from :checkin. Details: :url',
        'cancelled' => 'Your room booking at :business for :dates (booking ID :code) has been cancelled.:reason',
        'nights' => '{1} :count night|[2,*] :count nights',
        'subject' => ':business — room booking :code',
        'button' => 'View your booking',
    ],

    // Added after a booking update when the business gave a reason.
    'reason' => 'Reason: :reason',

    'mail' => [
        'greeting' => 'Hello!',
        'salutation' => 'Regards, :business',
    ],
];
