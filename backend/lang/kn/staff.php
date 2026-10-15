<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'ಹೊಸ ಆರ್ಡರ್ #:number · ₹:total',
        'for' => ':when ಕ್ಕೆ',
        'types' => [
            'dine_in' => 'ಡೈನ್-ಇನ್',
            'takeaway' => 'ಟೇಕ್‌ಅವೇ',
            'delivery' => 'ಡೆಲಿವರಿ',
            'room_service' => 'ರೂಮ್ ಸರ್ವಿಸ್',
        ],
    ],
    'reservation' => [
        'title' => 'ಟೇಬಲ್ ಬುಕಿಂಗ್ · :name',
        'body' => ':count ಅತಿಥಿಗಳು · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'ರೂಮ್ ಬುಕಿಂಗ್ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'ಕಾರ್ಯಕ್ರಮದ ವಿಚಾರಣೆ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'ಮದುವೆ',
            'birthday' => 'ಹುಟ್ಟುಹಬ್ಬ',
            'anniversary' => 'ವಿವಾಹ ವಾರ್ಷಿಕೋತ್ಸವ',
            'corporate' => 'ಕಾರ್ಪೊರೇಟ್ ಕಾರ್ಯಕ್ರಮ',
            'other' => 'ಇತರ ಕಾರ್ಯಕ್ರಮ',
        ],
    ],
    'tiffin' => [
        'title' => 'ಟಿಫಿನ್ ವಿನಂತಿ · :name',
        'body' => ':plan · :date ರಿಂದ · :code',
        'default_plan' => 'ಮೀಲ್ ಪ್ಲಾನ್',
    ],
    // A delivery order given to a rider (Delivery rider role).
    'rider' => [
        'title' => 'ಡೆಲಿವರಿ #:number ನಿಮಗೆ ನೀಡಲಾಗಿದೆ',
        'collect' => 'ನಗದು ₹:amount ಪಡೆಯಬೇಕು',
    ],
    'push_test' => 'ಪರೀಕ್ಷಾ ಅಲರ್ಟ್: ಈ ಸಾಧನದಲ್ಲಿ ಪುಶ್ ನೋಟಿಫಿಕೇಶನ್‌ಗಳು ಕೆಲಸ ಮಾಡುತ್ತಿವೆ.',
];
