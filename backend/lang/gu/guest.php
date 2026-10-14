<?php

return [
    'order' => [
        'placed' => ':business: તમારો ઓર્ડર #:number (₹:total) મળી ગયો છે. અહીં ટ્રેક કરો: :url',
        'confirmed' => ':business એ તમારો ઓર્ડર #:number કન્ફર્મ કર્યો છે. ટ્રેક કરો: :url',
        'ready_takeaway' => ':business: તમારો ઓર્ડર #:number પિકઅપ માટે તૈયાર છે.',
        'ready_dine_in' => ':business: તમારો ઓર્ડર #:number તૈયાર છે.',
        'out_for_delivery' => ':business: તમારો ઓર્ડર #:number ડિલિવરી માટે નીકળી ગયો છે. ટ્રેક કરો: :url',
        'completed' => ':business પરથી ઓર્ડર કરવા બદલ આભાર! ઓર્ડર #:number પૂર્ણ થયો.',
        'cancelled' => 'માફ કરશો, :business ને તમારો ઓર્ડર #:number રદ કરવો પડ્યો. કારણ: :reason',
        'subject' => ':business — ઓર્ડર #:number',
        'button' => 'ઓર્ડર જુઓ',
    ],

    'reservation' => [
        'received' => ':business: :when, :party માટે ટેબલની તમારી વિનંતી મળી ગઈ છે. બુકિંગ ID :code. અમે જલ્દી કન્ફર્મ કરીશું: :url',
        'confirmed' => ':business: :when, :party માટે તમારું ટેબલ કન્ફર્મ છે. બુકિંગ ID :code. અહીં જુઓ: :url',
        'rejected' => 'માફ કરશો, :business તમારી બુકિંગ (:when, ID :code) લઈ શકે તેમ નથી.:reason',
        'cancelled' => ':business: તમારી બુકિંગ (:when, ID :code) રદ થઈ છે.:reason',
        'reminder' => 'યાદ અપાવીએ: :business માં :when, :party માટે તમારું ટેબલ બુક છે. બુકિંગ ID :code. રદ કરવું છે? :url',
        'party' => '{1} :count વ્યક્તિ|[2,*] :count લોકો',
        'subject' => ':business — બુકિંગ :code',
        'button' => 'બુકિંગ જુઓ',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) માટે તમારી રૂમની વિનંતી મળી ગઈ છે. બુકિંગ ID :code. અમે જલ્દી કન્ફર્મ કરીશું: :url',
        'confirmed' => ':business: :dates (:nights) માટે તમારો રૂમ કન્ફર્મ છે. બુકિંગ ID :code. ચેક-ઇન :checkin થી. વિગતો: :url',
        'cancelled' => ':business: :dates ની તમારી રૂમ બુકિંગ (ID :code) રદ થઈ છે.:reason',
        'nights' => ':count રાત',
        'subject' => ':business — રૂમ બુકિંગ :code',
        'button' => 'બુકિંગ જુઓ',
    ],

    'tiffin' => [
        'confirmed' => ':business: તમારો ટિફિન પ્લાન :plan કન્ફર્મ થઈ ગયો છે (સબ્સ્ક્રિપ્શન :code). જમવાનું :from થી :until સુધી મળશે.',
        'declined' => 'માફ કરશો, :business તમારો ટિફિન પ્લાન :plan શરૂ કરી શકતું નથી (વિનંતી :code). કોઈ પ્રશ્ન હોય તો અમને કૉલ કરો.',
        'paused' => ':business: તમારું ટિફિન સબ્સ્ક્રિપ્શન :code થોભાવવામાં આવ્યું છે. ફરી શરૂ થાય ત્યાં સુધી જમવાનું નહીં આવે.',
        'resumed' => ':business: તમારું ટિફિન સબ્સ્ક્રિપ્શન :code ફરી શરૂ થયું છે. હવે તે :until સુધી ચાલશે.',
        'cancelled' => ':business સાથેનું તમારું ટિફિન સબ્સ્ક્રિપ્શન :code રદ કરવામાં આવ્યું છે.',
        'default_plan' => 'ટિફિન',
        'subject' => ':business — ટિફિન :code',
    ],

    'reason' => 'કારણ: :reason',

    'mail' => [
        'greeting' => 'નમસ્તે!',
        'salutation' => 'આભાર, :business',
    ],
];
