<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'नवीन ऑर्डर #:number · ₹:total',
        'for' => ':when साठी',
        'types' => [
            'dine_in' => 'डाइन-इन',
            'takeaway' => 'टेकअवे',
            'delivery' => 'डिलिव्हरी',
            'room_service' => 'रूम सर्व्हिस',
        ],
    ],
    'reservation' => [
        'title' => 'टेबल बुकिंग · :name',
        'body' => ':count पाहुणे · :date, :time वाजता · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'रूम बुकिंग · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'कार्यक्रमाची चौकशी · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'लग्न',
            'birthday' => 'वाढदिवस',
            'anniversary' => 'लग्नाचा वाढदिवस',
            'corporate' => 'कॉर्पोरेट कार्यक्रम',
            'other' => 'इतर कार्यक्रम',
        ],
    ],
    'tiffin' => [
        'title' => 'टिफिनची विनंती · :name',
        'body' => ':plan · :date पासून · :code',
        'default_plan' => 'मील प्लॅन',
    ],
    'push_test' => 'चाचणी सूचना: या डिव्हाइसवर पुश नोटिफिकेशन काम करत आहेत.',
];
