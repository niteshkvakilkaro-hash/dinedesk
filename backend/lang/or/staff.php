<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'ନୂଆ ଅର୍ଡର #:number · ₹:total',
        'for' => ':when ପାଇଁ',
        'types' => [
            'dine_in' => 'ଡାଇନ-ଇନ',
            'takeaway' => 'ଟେକଅୱେ',
            'delivery' => 'ଡେଲିଭରି',
            'room_service' => 'ରୁମ ସର୍ଭିସ',
        ],
    ],
    'reservation' => [
        'title' => 'ଟେବୁଲ ବୁକିଂ · :name',
        'body' => ':count ଜଣ ଅତିଥି · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'ରୁମ ବୁକିଂ · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'କାର୍ଯ୍ୟକ୍ରମ ବିଷୟରେ ପଚରାଉଚରା · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'ବିବାହ',
            'birthday' => 'ଜନ୍ମଦିନ',
            'anniversary' => 'ବିବାହ ବାର୍ଷିକୀ',
            'corporate' => 'କର୍ପୋରେଟ କାର୍ଯ୍ୟକ୍ରମ',
            'other' => 'ଅନ୍ୟ କାର୍ଯ୍ୟକ୍ରମ',
        ],
    ],
    'tiffin' => [
        'title' => 'ଟିଫିନ ଅନୁରୋଧ · :name',
        'body' => ':plan · :date ରୁ · :code',
        'default_plan' => 'ମିଲ ପ୍ଲାନ',
    ],
    // A delivery order given to a rider (Delivery rider role).
    'rider' => [
        'title' => 'ଡେଲିଭରି #:number ଆପଣଙ୍କୁ ଦିଆଯାଇଛି',
        'collect' => 'ନଗଦ ₹:amount ନେବାକୁ ହେବ',
    ],
    'push_test' => 'ଟେଷ୍ଟ ଆଲର୍ଟ: ଏହି ଡିଭାଇସରେ ପୁସ ନୋଟିଫିକେସନ କାମ କରୁଛି।',
];
