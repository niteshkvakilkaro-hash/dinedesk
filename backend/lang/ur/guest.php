<?php

return [
    'order' => [
        'placed' => ':business: آپ کا آرڈر #:number (₹:total) مل گیا ہے۔ یہاں ٹریک کریں: :url',
        'confirmed' => ':business نے آپ کا آرڈر #:number کنفرم کر دیا ہے۔ ٹریک کریں: :url',
        'ready_takeaway' => ':business سے آپ کا آرڈر #:number پک اپ کے لیے تیار ہے۔',
        'ready_dine_in' => ':business سے آپ کا آرڈر #:number تیار ہے۔',
        'out_for_delivery' => ':business سے آپ کا آرڈر #:number ڈیلیوری کے لیے نکل چکا ہے۔ ٹریک کریں: :url',
        'completed' => ':business سے آرڈر کرنے کا شکریہ! آرڈر #:number مکمل ہو گیا۔',
        'cancelled' => 'معذرت، :business کو آپ کا آرڈر #:number منسوخ کرنا پڑا۔ وجہ: :reason',
        'subject' => ':business — آرڈر #:number',
        'button' => 'آرڈر دیکھیں',
    ],

    'reservation' => [
        'received' => ':business: :when، :party کے لیے ٹیبل کی آپ کی درخواست مل گئی ہے۔ بکنگ ID :code۔ ہم جلد کنفرم کریں گے: :url',
        'confirmed' => ':business: :when، :party کے لیے آپ کی ٹیبل کنفرم ہے۔ بکنگ ID :code۔ یہاں دیکھیں: :url',
        'rejected' => 'معذرت، :business :when کی آپ کی بکنگ (ID :code) نہیں لے سکتا۔:reason',
        'cancelled' => ':business میں :when کی آپ کی بکنگ (ID :code) منسوخ ہو گئی ہے۔:reason',
        'reminder' => 'یاد دہانی: :business میں :party کے لیے آپ کی ٹیبل :when بک ہے۔ بکنگ ID :code۔ منسوخ کرنی ہے؟ :url',
        'party' => '{1} :count فرد|[2,*] :count لوگوں',
        'subject' => ':business — بکنگ :code',
        'button' => 'بکنگ دیکھیں',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) کے لیے آپ کی کمرے کی درخواست مل گئی ہے۔ بکنگ ID :code۔ ہم جلد کنفرم کریں گے: :url',
        'confirmed' => ':business: :dates (:nights) کے لیے آپ کا کمرہ کنفرم ہے۔ بکنگ ID :code۔ چیک اِن :checkin سے۔ تفصیلات: :url',
        'cancelled' => ':business میں :dates کی آپ کی کمرے کی بکنگ (ID :code) منسوخ ہو گئی ہے۔:reason',
        'nights' => ':count رات',
        'subject' => ':business — کمرے کی بکنگ :code',
        'button' => 'بکنگ دیکھیں',
    ],

    'reason' => 'وجہ: :reason',

    'mail' => [
        'greeting' => 'آداب!',
        'salutation' => 'شکریہ، :business',
    ],
];
