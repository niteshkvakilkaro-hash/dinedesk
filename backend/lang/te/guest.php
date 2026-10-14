<?php

return [
    'order' => [
        'placed' => ':business: మీ ఆర్డర్ #:number (₹:total) అందింది. ఇక్కడ ట్రాక్ చేయండి: :url',
        'confirmed' => ':business: మీ ఆర్డర్ #:number కన్ఫర్మ్ అయింది. ట్రాక్ చేయండి: :url',
        'ready_takeaway' => ':business: మీ ఆర్డర్ #:number పికప్‌కు సిద్ధంగా ఉంది.',
        'ready_dine_in' => ':business: మీ ఆర్డర్ #:number సిద్ధంగా ఉంది.',
        'out_for_delivery' => ':business: మీ ఆర్డర్ #:number డెలివరీకి బయలుదేరింది. ట్రాక్ చేయండి: :url',
        'completed' => ':business: ఆర్డర్ చేసినందుకు ధన్యవాదాలు! ఆర్డర్ #:number పూర్తయింది.',
        'cancelled' => ':business: క్షమించండి, మీ ఆర్డర్ #:number రద్దు చేయాల్సి వచ్చింది. కారణం: :reason',
        'subject' => ':business — ఆర్డర్ #:number',
        'button' => 'ఆర్డర్ చూడండి',
    ],

    'reservation' => [
        'received' => ':business: :when, :party టేబుల్ కోసం మీ అభ్యర్థన అందింది. బుకింగ్ ID :code. త్వరలో కన్ఫర్మ్ చేస్తాము: :url',
        'confirmed' => ':business: :when, :party మీ టేబుల్ కన్ఫర్మ్ అయింది. బుకింగ్ ID :code. ఇక్కడ చూడండి: :url',
        'rejected' => 'క్షమించండి, :business మీ బుకింగ్ (:when, ID :code) తీసుకోలేకపోతోంది.:reason',
        'cancelled' => ':business: మీ బుకింగ్ (:when, ID :code) రద్దయింది.:reason',
        'reminder' => 'గుర్తుచేస్తున్నాం: :business, :when, :party మీ టేబుల్ బుక్ అయింది. బుకింగ్ ID :code. రద్దు చేయాలా? :url',
        'party' => '{1} :count వ్యక్తికి|[2,*] :count మందికి',
        'subject' => ':business — బుకింగ్ :code',
        'button' => 'బుకింగ్ చూడండి',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) గది కోసం మీ అభ్యర్థన అందింది. బుకింగ్ ID :code. త్వరలో కన్ఫర్మ్ చేస్తాము: :url',
        'confirmed' => ':business: :dates (:nights) మీ గది కన్ఫర్మ్ అయింది. బుకింగ్ ID :code. చెక్-ఇన్ :checkin నుండి. వివరాలు: :url',
        'cancelled' => ':business: :dates మీ గది బుకింగ్ (ID :code) రద్దయింది.:reason',
        'nights' => '{1} :count రాత్రి|[2,*] :count రాత్రులు',
        'subject' => ':business — గది బుకింగ్ :code',
        'button' => 'బుకింగ్ చూడండి',
    ],

    'tiffin' => [
        'confirmed' => ':business: మీ టిఫిన్ ప్లాన్ :plan నిర్ధారించబడింది (సబ్‌స్క్రిప్షన్ :code). భోజనం :from నుండి :until వరకు అందుతుంది.',
        'declined' => 'క్షమించండి, :business మీ టిఫిన్ ప్లాన్ :plan ప్రారంభించలేదు (అభ్యర్థన :code). ఏవైనా ప్రశ్నలుంటే మాకు కాల్ చేయండి.',
        'paused' => ':business: మీ టిఫిన్ సబ్‌స్క్రిప్షన్ :code నిలిపివేయబడింది. మళ్లీ ప్రారంభించే వరకు భోజనం రాదు.',
        'resumed' => ':business: మీ టిఫిన్ సబ్‌స్క్రిప్షన్ :code మళ్లీ ప్రారంభమైంది. ఇది ఇప్పుడు :until వరకు కొనసాగుతుంది.',
        'cancelled' => ':business లో మీ టిఫిన్ సబ్‌స్క్రిప్షన్ :code రద్దు చేయబడింది.',
        'default_plan' => 'టిఫిన్',
        'subject' => ':business — టిఫిన్ :code',
    ],

    'reason' => 'కారణం: :reason',

    'mail' => [
        'greeting' => 'నమస్కారం!',
        'salutation' => 'ధన్యవాదాలు, :business',
    ],
];
