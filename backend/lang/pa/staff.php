<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'ਨਵਾਂ ਆਰਡਰ #:number · ₹:total',
        'for' => ':when ਲਈ',
        'types' => [
            'dine_in' => 'ਡਾਈਨ-ਇਨ',
            'takeaway' => 'ਟੇਕਅਵੇ',
            'delivery' => 'ਡਿਲੀਵਰੀ',
            'room_service' => 'ਰੂਮ ਸਰਵਿਸ',
        ],
    ],
    'reservation' => [
        'title' => 'ਟੇਬਲ ਬੁਕਿੰਗ · :name',
        'body' => ':count ਮਹਿਮਾਨ · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'ਰੂਮ ਬੁਕਿੰਗ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'ਸਮਾਗਮ ਬਾਰੇ ਪੁੱਛਗਿੱਛ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'ਵਿਆਹ',
            'birthday' => 'ਜਨਮਦਿਨ',
            'anniversary' => 'ਵਰ੍ਹੇਗੰਢ',
            'corporate' => 'ਕਾਰਪੋਰੇਟ ਸਮਾਗਮ',
            'other' => 'ਹੋਰ ਸਮਾਗਮ',
        ],
    ],
    'tiffin' => [
        'title' => 'ਟਿਫਿਨ ਦੀ ਬੇਨਤੀ · :name',
        'body' => ':plan · :date ਤੋਂ · :code',
        'default_plan' => 'ਮੀਲ ਪਲਾਨ',
    ],
    'push_test' => 'ਟੈਸਟ ਅਲਰਟ: ਇਸ ਡਿਵਾਈਸ \'ਤੇ ਪੁਸ਼ ਨੋਟੀਫਿਕੇਸ਼ਨ ਕੰਮ ਕਰ ਰਹੇ ਹਨ।',
];
