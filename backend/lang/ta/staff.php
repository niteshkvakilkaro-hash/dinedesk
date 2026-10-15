<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'புதிய ஆர்டர் #:number · ₹:total',
        'for' => ':when-க்கு',
        'types' => [
            'dine_in' => 'டைன்-இன்',
            'takeaway' => 'டேக்அவே',
            'delivery' => 'டெலிவரி',
            'room_service' => 'ரூம் சர்வீஸ்',
        ],
    ],
    'reservation' => [
        'title' => 'டேபிள் புக்கிங் · :name',
        'body' => ':count விருந்தினர்கள் · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'ரூம் புக்கிங் · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'நிகழ்ச்சி விசாரணை · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'திருமணம்',
            'birthday' => 'பிறந்தநாள்',
            'anniversary' => 'திருமண நாள்',
            'corporate' => 'கார்ப்பரேட் நிகழ்ச்சி',
            'other' => 'பிற நிகழ்ச்சி',
        ],
    ],
    'tiffin' => [
        'title' => 'டிஃபின் கோரிக்கை · :name',
        'body' => ':plan · :date முதல் · :code',
        'default_plan' => 'மீல் பிளான்',
    ],
    // A delivery order given to a rider (Delivery rider role).
    'rider' => [
        'title' => 'டெலிவரி #:number உங்களுக்கு ஒதுக்கப்பட்டது',
        'collect' => 'பணம் ₹:amount வசூலிக்க வேண்டும்',
    ],
    'push_test' => 'சோதனை அறிவிப்பு: இந்தச் சாதனத்தில் புஷ் அறிவிப்புகள் வேலை செய்கின்றன.',
];
