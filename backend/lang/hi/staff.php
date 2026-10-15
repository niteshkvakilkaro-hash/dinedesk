<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'नया ऑर्डर #:number · ₹:total',
        'for' => ':when के लिए',
        'types' => [
            'dine_in' => 'डाइन-इन',
            'takeaway' => 'टेकअवे',
            'delivery' => 'डिलीवरी',
            'room_service' => 'रूम सर्विस',
        ],
    ],
    'reservation' => [
        'title' => 'टेबल बुकिंग · :name',
        'body' => ':count मेहमान · :date को :time बजे · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'रूम बुकिंग · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'इवेंट की पूछताछ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'शादी',
            'birthday' => 'जन्मदिन',
            'anniversary' => 'सालगिरह',
            'corporate' => 'कॉर्पोरेट इवेंट',
            'other' => 'अन्य इवेंट',
        ],
    ],
    'tiffin' => [
        'title' => 'टिफ़िन का अनुरोध · :name',
        'body' => ':plan · :date से · :code',
        'default_plan' => 'मील प्लान',
    ],
    // A delivery order given to a rider (Delivery rider role).
    'rider' => [
        'title' => 'डिलीवरी #:number आपको दी गई',
        'collect' => 'कैश ₹:amount लेना है',
    ],
    'push_test' => 'टेस्ट अलर्ट: इस डिवाइस पर पुश नोटिफ़िकेशन काम कर रहे हैं।',
];
