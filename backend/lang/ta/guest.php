<?php

return [
    'order' => [
        'placed' => ':business: உங்கள் ஆர்டர் #:number (₹:total) கிடைத்தது. இங்கே டிராக் செய்யுங்கள்: :url',
        'confirmed' => ':business: உங்கள் ஆர்டர் #:number உறுதிசெய்யப்பட்டது. டிராக் செய்ய: :url',
        'ready_takeaway' => ':business: உங்கள் ஆர்டர் #:number பிக்அப்புக்குத் தயார்.',
        'ready_dine_in' => ':business: உங்கள் ஆர்டர் #:number தயார்.',
        'out_for_delivery' => ':business: உங்கள் ஆர்டர் #:number டெலிவரிக்குப் புறப்பட்டுவிட்டது. டிராக் செய்ய: :url',
        'completed' => ':business: ஆர்டர் செய்ததற்கு நன்றி! ஆர்டர் #:number நிறைவடைந்தது.',
        'cancelled' => ':business: மன்னிக்கவும், உங்கள் ஆர்டர் #:number ரத்து செய்யப்பட்டது. காரணம்: :reason',
        'subject' => ':business — ஆர்டர் #:number',
        'button' => 'ஆர்டரைப் பார்க்க',
    ],

    'reservation' => [
        'received' => ':business: :when, :party டேபிள் கோரிக்கை கிடைத்தது. புக்கிங் ID :code. விரைவில் உறுதிசெய்வோம்: :url',
        'confirmed' => ':business: :when, :party உங்கள் டேபிள் உறுதிசெய்யப்பட்டது. புக்கிங் ID :code. இங்கே பார்க்கலாம்: :url',
        'rejected' => 'மன்னிக்கவும், :business உங்கள் புக்கிங்கை (:when, ID :code) ஏற்க முடியவில்லை.:reason',
        'cancelled' => ':business: உங்கள் புக்கிங் (:when, ID :code) ரத்து செய்யப்பட்டது.:reason',
        'reminder' => 'நினைவூட்டல்: :business, :when, :party உங்கள் டேபிள் புக் செய்யப்பட்டுள்ளது. புக்கிங் ID :code. ரத்து செய்ய வேண்டுமா? :url',
        'party' => '{1} :count நபருக்கு|[2,*] :count பேருக்கு',
        'subject' => ':business — புக்கிங் :code',
        'button' => 'புக்கிங்கைப் பார்க்க',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) அறைக்கான உங்கள் கோரிக்கை கிடைத்தது. புக்கிங் ID :code. விரைவில் உறுதிசெய்வோம்: :url',
        'confirmed' => ':business: :dates (:nights) உங்கள் அறை உறுதிசெய்யப்பட்டது. புக்கிங் ID :code. செக்-இன் :checkin முதல். விவரங்கள்: :url',
        'cancelled' => ':business: :dates உங்கள் அறை புக்கிங் (ID :code) ரத்து செய்யப்பட்டது.:reason',
        'nights' => '{1} :count இரவு|[2,*] :count இரவுகள்',
        'subject' => ':business — அறை புக்கிங் :code',
        'button' => 'புக்கிங்கைப் பார்க்க',
    ],

    'reason' => 'காரணம்: :reason',

    'mail' => [
        'greeting' => 'வணக்கம்!',
        'salutation' => 'நன்றி, :business',
    ],
];
