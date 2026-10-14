<?php

return [
    'order' => [
        'placed' => ':business: ನಿಮ್ಮ ಆರ್ಡರ್ #:number (₹:total) ಸಿಕ್ಕಿದೆ. ಇಲ್ಲಿ ಟ್ರ್ಯಾಕ್ ಮಾಡಿ: :url',
        'confirmed' => ':business: ನಿಮ್ಮ ಆರ್ಡರ್ #:number ಕನ್ಫರ್ಮ್ ಆಗಿದೆ. ಟ್ರ್ಯಾಕ್ ಮಾಡಿ: :url',
        'ready_takeaway' => ':business: ನಿಮ್ಮ ಆರ್ಡರ್ #:number ಪಿಕಪ್‌ಗೆ ಸಿದ್ಧವಾಗಿದೆ.',
        'ready_dine_in' => ':business: ನಿಮ್ಮ ಆರ್ಡರ್ #:number ಸಿದ್ಧವಾಗಿದೆ.',
        'out_for_delivery' => ':business: ನಿಮ್ಮ ಆರ್ಡರ್ #:number ಡೆಲಿವರಿಗೆ ಹೊರಟಿದೆ. ಟ್ರ್ಯಾಕ್ ಮಾಡಿ: :url',
        'completed' => ':business: ಆರ್ಡರ್ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು! ಆರ್ಡರ್ #:number ಪೂರ್ಣಗೊಂಡಿದೆ.',
        'cancelled' => ':business: ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಆರ್ಡರ್ #:number ರದ್ದು ಮಾಡಬೇಕಾಯಿತು. ಕಾರಣ: :reason',
        'subject' => ':business — ಆರ್ಡರ್ #:number',
        'button' => 'ಆರ್ಡರ್ ನೋಡಿ',
    ],

    'reservation' => [
        'received' => ':business: :when, :party ಟೇಬಲ್‌ಗಾಗಿ ನಿಮ್ಮ ವಿನಂತಿ ಸಿಕ್ಕಿದೆ. ಬುಕಿಂಗ್ ID :code. ಶೀಘ್ರದಲ್ಲೇ ಕನ್ಫರ್ಮ್ ಮಾಡುತ್ತೇವೆ: :url',
        'confirmed' => ':business: :when, :party ನಿಮ್ಮ ಟೇಬಲ್ ಕನ್ಫರ್ಮ್ ಆಗಿದೆ. ಬುಕಿಂಗ್ ID :code. ಇಲ್ಲಿ ನೋಡಿ: :url',
        'rejected' => 'ಕ್ಷಮಿಸಿ, :business ನಿಮ್ಮ ಬುಕಿಂಗ್ (:when, ID :code) ಸ್ವೀಕರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.:reason',
        'cancelled' => ':business: ನಿಮ್ಮ ಬುಕಿಂಗ್ (:when, ID :code) ರದ್ದಾಗಿದೆ.:reason',
        'reminder' => 'ನೆನಪಿಸುತ್ತಿದ್ದೇವೆ: :business, :when, :party ನಿಮ್ಮ ಟೇಬಲ್ ಬುಕ್ ಆಗಿದೆ. ಬುಕಿಂಗ್ ID :code. ರದ್ದು ಮಾಡಬೇಕೆ? :url',
        'party' => '{1} :count ವ್ಯಕ್ತಿಗೆ|[2,*] :count ಜನರಿಗೆ',
        'subject' => ':business — ಬುಕಿಂಗ್ :code',
        'button' => 'ಬುಕಿಂಗ್ ನೋಡಿ',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) ಕೋಣೆಗಾಗಿ ನಿಮ್ಮ ವಿನಂತಿ ಸಿಕ್ಕಿದೆ. ಬುಕಿಂಗ್ ID :code. ಶೀಘ್ರದಲ್ಲೇ ಕನ್ಫರ್ಮ್ ಮಾಡುತ್ತೇವೆ: :url',
        'confirmed' => ':business: :dates (:nights) ನಿಮ್ಮ ಕೋಣೆ ಕನ್ಫರ್ಮ್ ಆಗಿದೆ. ಬುಕಿಂಗ್ ID :code. ಚೆಕ್-ಇನ್ :checkin ರಿಂದ. ವಿವರಗಳು: :url',
        'cancelled' => ':business: :dates ನಿಮ್ಮ ಕೋಣೆ ಬುಕಿಂಗ್ (ID :code) ರದ್ದಾಗಿದೆ.:reason',
        'nights' => '{1} :count ರಾತ್ರಿ|[2,*] :count ರಾತ್ರಿಗಳು',
        'subject' => ':business — ಕೋಣೆ ಬುಕಿಂಗ್ :code',
        'button' => 'ಬುಕಿಂಗ್ ನೋಡಿ',
    ],

    'tiffin' => [
        'confirmed' => ':business: ನಿಮ್ಮ ಟಿಫಿನ್ ಪ್ಲಾನ್ :plan ದೃಢೀಕರಿಸಲಾಗಿದೆ (ಚಂದಾದಾರಿಕೆ :code). :from ರಿಂದ :until ವರೆಗೆ ಊಟ ಸಿಗುತ್ತದೆ.',
        'declined' => 'ಕ್ಷಮಿಸಿ, :business ನಿಮ್ಮ ಟಿಫಿನ್ ಪ್ಲಾನ್ :plan ಪ್ರಾರಂಭಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ (ವಿನಂತಿ :code). ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ನಮಗೆ ಕರೆ ಮಾಡಿ.',
        'paused' => ':business: ನಿಮ್ಮ ಟಿಫಿನ್ ಚಂದಾದಾರಿಕೆ :code ತಡೆಹಿಡಿಯಲಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಾರಂಭವಾಗುವವರೆಗೆ ಊಟ ಬರುವುದಿಲ್ಲ.',
        'resumed' => ':business: ನಿಮ್ಮ ಟಿಫಿನ್ ಚಂದಾದಾರಿಕೆ :code ಮತ್ತೆ ಪ್ರಾರಂಭವಾಗಿದೆ. ಈಗ ಇದು :until ವರೆಗೆ ಇರುತ್ತದೆ.',
        'cancelled' => ':business ನಲ್ಲಿನ ನಿಮ್ಮ ಟಿಫಿನ್ ಚಂದಾದಾರಿಕೆ :code ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.',
        'default_plan' => 'ಟಿಫಿನ್',
        'subject' => ':business — ಟಿಫಿನ್ :code',
    ],

    'reason' => 'ಕಾರಣ: :reason',

    'mail' => [
        'greeting' => 'ನಮಸ್ಕಾರ!',
        'salutation' => 'ಧನ್ಯವಾದಗಳು, :business',
    ],
];
