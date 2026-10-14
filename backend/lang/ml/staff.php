<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'പുതിയ ഓർഡർ #:number · ₹:total',
        'for' => ':when-ന്',
        'types' => [
            'dine_in' => 'ഡൈൻ-ഇൻ',
            'takeaway' => 'ടേക്ക്എവേ',
            'delivery' => 'ഡെലിവറി',
            'room_service' => 'റൂം സർവീസ്',
        ],
    ],
    'reservation' => [
        'title' => 'ടേബിൾ ബുക്കിംഗ് · :name',
        'body' => ':count അതിഥികൾ · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'റൂം ബുക്കിംഗ് · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'പരിപാടിയെക്കുറിച്ചുള്ള അന്വേഷണം · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'വിവാഹം',
            'birthday' => 'ജന്മദിനം',
            'anniversary' => 'വിവാഹ വാർഷികം',
            'corporate' => 'കോർപ്പറേറ്റ് പരിപാടി',
            'other' => 'മറ്റ് പരിപാടി',
        ],
    ],
    'tiffin' => [
        'title' => 'ടിഫിൻ അഭ്യർത്ഥന · :name',
        'body' => ':plan · :date മുതൽ · :code',
        'default_plan' => 'മീൽ പ്ലാൻ',
    ],
    'push_test' => 'ടെസ്റ്റ് അലേർട്ട്: ഈ ഉപകരണത്തിൽ പുഷ് നോട്ടിഫിക്കേഷനുകൾ പ്രവർത്തിക്കുന്നു.',
];
