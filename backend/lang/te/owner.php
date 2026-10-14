<?php

return [
    'summary' => [
        'title' => ':business · :date సారాంశం',
        'title_so_far' => ':business · ఈరోజు ఇప్పటివరకు (:date, :time)',
        'sales' => 'ఆర్డర్లు: :orders · అమ్మకాలు: ₹:amount',
        'no_orders' => 'ఈ రోజు ఆర్డర్లు లేవు.',
        'types' => [
            'dine_in' => 'డైన్-ఇన్',
            'takeaway' => 'టేక్‌అవే',
            'delivery' => 'డెలివరీ',
            'room_service' => 'రూమ్ సర్వీస్',
        ],
        'top' => 'టాప్ వంటకాలు: :dishes',
        'bookings' => 'టేబుల్ బుకింగ్‌లు: :count · అతిథులు: :guests',
        'hotel' => 'గదులు: :occupancy% నిండాయి · ఈరోజు చెక్-ఇన్‌లు: :checkins',
        'low_stock' => 'తక్కువ స్టాక్ (:count): :names',
        'link' => 'పూర్తి నివేదిక: :url',
    ],
    // Refer a business: a business that signed up with the owner's link started paying.
    'referral' => [
        'subject' => ':business మీ లింక్‌తో చేరింది: మీకు :days రోజులు ఉచితం',
        'paid' => ':business మీ రెఫరల్ లింక్‌తో సైన్ అప్ చేసి పెయిడ్ ప్లాన్ ప్రారంభించింది.',
        'applied_trial' => 'మీ ట్రయల్‌కు :days రోజులు ఉచితంగా జోడించాము. ఇది ఇప్పుడు :date న ముగుస్తుంది.',
        'applied_period' => ':days రోజులు ఉచితంగా జోడించాము. మీ ప్లాన్ ఇప్పుడు :date వరకు కొనసాగుతుంది.',
        'pending' => 'మీ ప్లాన్ ఆటోమేటిక్‌గా రెన్యూ అవుతుంది, కాబట్టి మీ :days ఉచిత రోజులు ప్రస్తుతానికి క్రెడిట్‌గా ఉంచాము. మా టీమ్ వాటిని వర్తింపజేస్తుంది, లేదా ప్లాన్ రెన్యూ కావడం ఆగితే అవి వాటంతట అవే జోడించబడతాయి.',
        'thanks' => 'మమ్మల్ని ఇతరులకు సిఫార్సు చేసినందుకు ధన్యవాదాలు!',
        'link' => 'మీ రెఫరల్స్: :url',
    ],
];
