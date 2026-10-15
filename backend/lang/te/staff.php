<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'కొత్త ఆర్డర్ #:number · ₹:total',
        'for' => ':when కోసం',
        'types' => [
            'dine_in' => 'డైన్-ఇన్',
            'takeaway' => 'టేక్‌అవే',
            'delivery' => 'డెలివరీ',
            'room_service' => 'రూమ్ సర్వీస్',
        ],
    ],
    'reservation' => [
        'title' => 'టేబుల్ బుకింగ్ · :name',
        'body' => ':count మంది అతిథులు · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'రూమ్ బుకింగ్ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'ఈవెంట్ విచారణ · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'పెళ్లి',
            'birthday' => 'పుట్టినరోజు',
            'anniversary' => 'వివాహ వార్షికోత్సవం',
            'corporate' => 'కార్పొరేట్ ఈవెంట్',
            'other' => 'ఇతర ఈవెంట్',
        ],
    ],
    'tiffin' => [
        'title' => 'టిఫిన్ అభ్యర్థన · :name',
        'body' => ':plan · :date నుండి · :code',
        'default_plan' => 'మీల్ ప్లాన్',
    ],
    // A delivery order given to a rider (Delivery rider role).
    'rider' => [
        'title' => 'డెలివరీ #:number మీకు ఇవ్వబడింది',
        'collect' => 'నగదు ₹:amount తీసుకోవాలి',
    ],
    'push_test' => 'టెస్ట్ అలర్ట్: ఈ పరికరంలో పుష్ నోటిఫికేషన్లు పనిచేస్తున్నాయి.',
];
