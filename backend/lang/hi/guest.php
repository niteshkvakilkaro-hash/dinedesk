<?php

return [
    'order' => [
        'placed' => ':business: आपका ऑर्डर #:number (₹:total) मिल गया है। यहाँ ट्रैक करें: :url',
        'confirmed' => ':business ने आपका ऑर्डर #:number कन्फ़र्म कर दिया है। ट्रैक करें: :url',
        'ready_takeaway' => ':business से आपका ऑर्डर #:number पिकअप के लिए तैयार है।',
        'ready_dine_in' => ':business से आपका ऑर्डर #:number तैयार है।',
        'out_for_delivery' => ':business से आपका ऑर्डर #:number डिलीवरी के लिए निकल चुका है। ट्रैक करें: :url',
        'completed' => ':business से ऑर्डर करने के लिए धन्यवाद! ऑर्डर #:number पूरा हुआ।',
        'cancelled' => 'माफ़ कीजिए, :business को आपका ऑर्डर #:number रद्द करना पड़ा। कारण: :reason',
        'subject' => ':business — ऑर्डर #:number',
        'button' => 'ऑर्डर देखें',
    ],

    'reservation' => [
        'received' => ':business: :when के लिए :party की टेबल का आपका अनुरोध मिल गया है। बुकिंग ID :code। हम जल्द कन्फ़र्म करेंगे: :url',
        'confirmed' => ':business: :when के लिए :party की आपकी टेबल कन्फ़र्म है। बुकिंग ID :code। यहाँ देखें: :url',
        'rejected' => 'माफ़ कीजिए, :business :when की आपकी बुकिंग (ID :code) नहीं ले सकता।:reason',
        'cancelled' => ':business में :when की आपकी बुकिंग (ID :code) रद्द हो गई है।:reason',
        'reminder' => 'याद दिला दें: :business में :party के लिए आपकी टेबल :when बुक है। बुकिंग ID :code। रद्द करनी है? :url',
        'party' => '{1} :count व्यक्ति|[2,*] :count लोगों',
        'subject' => ':business — बुकिंग :code',
        'button' => 'बुकिंग देखें',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) के लिए आपका कमरे का अनुरोध मिल गया है। बुकिंग ID :code। हम जल्द कन्फ़र्म करेंगे: :url',
        'confirmed' => ':business: :dates (:nights) के लिए आपका कमरा कन्फ़र्म है। बुकिंग ID :code। चेक-इन :checkin से। विवरण: :url',
        'cancelled' => ':business में :dates की आपकी कमरा बुकिंग (ID :code) रद्द हो गई है।:reason',
        'nights' => ':count रात',
        'subject' => ':business — कमरा बुकिंग :code',
        'button' => 'बुकिंग देखें',
    ],

    'reason' => 'कारण: :reason',

    'mail' => [
        'greeting' => 'नमस्ते!',
        'salutation' => 'धन्यवाद, :business',
    ],
];
