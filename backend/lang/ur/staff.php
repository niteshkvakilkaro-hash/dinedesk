<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'نیا آرڈر #:number · ₹:total',
        'for' => ':when کے لیے',
        'types' => [
            'dine_in' => 'ڈائن اِن',
            'takeaway' => 'ٹیک اوے',
            'delivery' => 'ڈیلیوری',
            'room_service' => 'روم سروس',
        ],
    ],
    'reservation' => [
        'title' => 'ٹیبل بکنگ · :name',
        'body' => ':count مہمان · :date، :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'روم بکنگ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'تقریب کی پوچھ گچھ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'شادی',
            'birthday' => 'سالگرہ',
            'anniversary' => 'شادی کی سالگرہ',
            'corporate' => 'کارپوریٹ تقریب',
            'other' => 'دیگر تقریب',
        ],
    ],
    'tiffin' => [
        'title' => 'ٹفن کی درخواست · :name',
        'body' => ':plan · :date سے · :code',
        'default_plan' => 'میل پلان',
    ],
    'push_test' => 'ٹیسٹ الرٹ: اس ڈیوائس پر پُش نوٹیفکیشن کام کر رہے ہیں۔',
];
