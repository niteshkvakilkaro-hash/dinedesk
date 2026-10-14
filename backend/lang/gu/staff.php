<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'નવો ઓર્ડર #:number · ₹:total',
        'for' => ':when માટે',
        'types' => [
            'dine_in' => 'ડાઇન-ઇન',
            'takeaway' => 'ટેકઅવે',
            'delivery' => 'ડિલિવરી',
            'room_service' => 'રૂમ સર્વિસ',
        ],
    ],
    'reservation' => [
        'title' => 'ટેબલ બુકિંગ · :name',
        'body' => ':count મહેમાન · :date, :time વાગ્યે · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'રૂમ બુકિંગ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'પ્રસંગની પૂછપરછ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'લગ્ન',
            'birthday' => 'જન્મદિવસ',
            'anniversary' => 'લગ્નતિથિ',
            'corporate' => 'કોર્પોરેટ ઇવેન્ટ',
            'other' => 'અન્ય પ્રસંગ',
        ],
    ],
    'tiffin' => [
        'title' => 'ટિફિનની વિનંતી · :name',
        'body' => ':plan · :date થી · :code',
        'default_plan' => 'મીલ પ્લાન',
    ],
    'push_test' => 'ટેસ્ટ એલર્ટ: આ ડિવાઇસ પર પુશ નોટિફિકેશન કામ કરે છે.',
];
