<?php

return [
    'order' => [
        'placed' => ':business: तुमची ऑर्डर #:number (₹:total) मिळाली आहे. इथे ट्रॅक करा: :url',
        'confirmed' => ':business ने तुमची ऑर्डर #:number कन्फर्म केली आहे. ट्रॅक करा: :url',
        'ready_takeaway' => ':business: तुमची ऑर्डर #:number पिकअपसाठी तयार आहे.',
        'ready_dine_in' => ':business: तुमची ऑर्डर #:number तयार आहे.',
        'out_for_delivery' => ':business: तुमची ऑर्डर #:number डिलिव्हरीसाठी निघाली आहे. ट्रॅक करा: :url',
        'completed' => ':business कडून ऑर्डर केल्याबद्दल धन्यवाद! ऑर्डर #:number पूर्ण झाली.',
        'cancelled' => 'माफ करा, :business ला तुमची ऑर्डर #:number रद्द करावी लागली. कारण: :reason',
        'subject' => ':business — ऑर्डर #:number',
        'button' => 'ऑर्डर पहा',
    ],

    'reservation' => [
        'received' => ':business: :when, :party टेबलची तुमची विनंती मिळाली आहे. बुकिंग ID :code. आम्ही लवकरच कन्फर्म करू: :url',
        'confirmed' => ':business: :when, :party तुमचे टेबल कन्फर्म झाले आहे. बुकिंग ID :code. इथे पहा: :url',
        'rejected' => 'माफ करा, :business तुमची बुकिंग (:when, ID :code) घेऊ शकत नाही.:reason',
        'cancelled' => ':business: तुमची बुकिंग (:when, ID :code) रद्द झाली आहे.:reason',
        'reminder' => 'आठवण: :business मध्ये :when, :party तुमचे टेबल बुक आहे. बुकिंग ID :code. रद्द करायचे आहे? :url',
        'party' => '{1} :count व्यक्तीसाठी|[2,*] :count जणांसाठी',
        'subject' => ':business — बुकिंग :code',
        'button' => 'बुकिंग पहा',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) साठी तुमची रूमची विनंती मिळाली आहे. बुकिंग ID :code. आम्ही लवकरच कन्फर्म करू: :url',
        'confirmed' => ':business: :dates (:nights) साठी तुमची रूम कन्फर्म झाली आहे. बुकिंग ID :code. चेक-इन :checkin पासून. तपशील: :url',
        'cancelled' => ':business: :dates ची तुमची रूम बुकिंग (ID :code) रद्द झाली आहे.:reason',
        'nights' => '{1} :count रात्र|[2,*] :count रात्री',
        'subject' => ':business — रूम बुकिंग :code',
        'button' => 'बुकिंग पहा',
    ],

    'tiffin' => [
        'confirmed' => ':business: तुमचा टिफिन प्लॅन :plan निश्चित झाला आहे (सबस्क्रिप्शन :code). जेवण :from पासून :until पर्यंत मिळेल.',
        'declined' => 'क्षमस्व, :business तुमचा टिफिन प्लॅन :plan सुरू करू शकत नाही (विनंती :code). काही प्रश्न असल्यास आम्हाला फोन करा.',
        'paused' => ':business: तुमचे टिफिन सबस्क्रिप्शन :code थांबवले आहे. पुन्हा सुरू होईपर्यंत जेवण येणार नाही.',
        'resumed' => ':business: तुमचे टिफिन सबस्क्रिप्शन :code पुन्हा सुरू झाले आहे. आता ते :until पर्यंत चालेल.',
        'cancelled' => ':business कडील तुमचे टिफिन सबस्क्रिप्शन :code रद्द केले आहे.',
        'default_plan' => 'टिफिन',
        'subject' => ':business — टिफिन :code',
    ],

    'reason' => 'कारण: :reason',

    'mail' => [
        'greeting' => 'नमस्कार!',
        'salutation' => 'धन्यवाद, :business',
    ],
];
