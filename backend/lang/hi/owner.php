<?php

return [
    'summary' => [
        'title' => ':business · :date का सारांश',
        'title_so_far' => ':business · आज अब तक (:date, :time)',
        'sales' => 'ऑर्डर: :orders · बिक्री: ₹:amount',
        'no_orders' => 'इस दिन कोई ऑर्डर नहीं।',
        'types' => [
            'dine_in' => 'डाइन-इन',
            'takeaway' => 'टेकअवे',
            'delivery' => 'डिलीवरी',
            'room_service' => 'रूम सर्विस',
        ],
        'top' => 'टॉप डिश: :dishes',
        'bookings' => 'टेबल बुकिंग: :count · मेहमान: :guests',
        'hotel' => 'कमरे: :occupancy% भरे · आज चेक-इन: :checkins',
        'low_stock' => 'कम स्टॉक (:count): :names',
        'link' => 'पूरी रिपोर्ट: :url',
    ],
    // Refer a business: a business that signed up with the owner's link started paying.
    'referral' => [
        'subject' => ':business आपके लिंक से जुड़ा: आपको :days दिन मुफ़्त',
        'paid' => ':business ने आपके रेफ़रल लिंक से साइन अप किया और पेड प्लान शुरू कर दिया है।',
        'applied_trial' => 'हमने आपके ट्रायल में :days दिन मुफ़्त जोड़ दिए हैं। अब यह :date को खत्म होगा।',
        'applied_period' => 'हमने :days दिन मुफ़्त जोड़ दिए हैं। आपका प्लान अब :date तक चलेगा।',
        'pending' => 'आपका प्लान अपने-आप रिन्यू होता है, इसलिए आपके :days मुफ़्त दिन अभी क्रेडिट के रूप में रखे गए हैं। हमारी टीम इन्हें लागू करेगी, या प्लान का रिन्यू होना बंद होने पर ये अपने-आप जुड़ जाएंगे।',
        'thanks' => 'हमें दूसरों को सुझाने के लिए धन्यवाद!',
        'link' => 'आपके रेफ़रल: :url',
    ],
];
