<?php

return [
    'summary' => [
        'title' => ':business · :date चा सारांश',
        'title_so_far' => ':business · आज आतापर्यंत (:date, :time)',
        'sales' => 'ऑर्डर: :orders · विक्री: ₹:amount',
        'no_orders' => 'या दिवशी एकही ऑर्डर नाही.',
        'types' => [
            'dine_in' => 'डाइन-इन',
            'takeaway' => 'टेकअवे',
            'delivery' => 'डिलिव्हरी',
            'room_service' => 'रूम सर्व्हिस',
        ],
        'top' => 'टॉप पदार्थ: :dishes',
        'bookings' => 'टेबल बुकिंग: :count · पाहुणे: :guests',
        'hotel' => 'खोल्या: :occupancy% भरलेल्या · आज चेक-इन: :checkins',
        'low_stock' => 'कमी स्टॉक (:count): :names',
        'tiffin' => 'टिफिन: :active सुरू · आजचे जेवण: :lunch दुपारचे, :dinner रात्रीचे',
        'tiffin_requests' => 'नवीन टिफिन विनंत्या: :count',
        'link' => 'पूर्ण अहवाल: :url',
    ],
    // Refer a business: a business that signed up with the owner's link started paying.
    'referral' => [
        'subject' => ':business तुमच्या लिंकने जोडले गेले: तुम्हाला :days दिवस मोफत',
        'paid' => ':business ने तुमच्या रेफरल लिंकने साइन अप केले आणि पेड प्लॅन सुरू केला आहे.',
        'applied_trial' => 'आम्ही तुमच्या ट्रायलमध्ये :days दिवस मोफत जोडले आहेत. ती आता :date ला संपेल.',
        'applied_period' => 'आम्ही :days दिवस मोफत जोडले आहेत. तुमचा प्लॅन आता :date पर्यंत चालेल.',
        'pending' => 'तुमचा प्लॅन आपोआप रिन्यू होतो, म्हणून तुमचे :days मोफत दिवस सध्या क्रेडिट म्हणून ठेवले आहेत. आमची टीम ते लागू करेल, किंवा प्लॅनचे रिन्यू होणे थांबल्यावर ते आपोआप जोडले जातील.',
        'thanks' => 'आमची शिफारस केल्याबद्दल धन्यवाद!',
        'link' => 'तुमचे रेफरल: :url',
    ],
];
