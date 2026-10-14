<?php

return [
    // A new order (website, QR, app).
    'order' => [
        'title' => 'নতুন অর্ডার #:number · ₹:total',
        'for' => ':when-এর জন্য',
        'types' => [
            'dine_in' => 'ডাইন-ইন',
            'takeaway' => 'টেকঅ্যাওয়ে',
            'delivery' => 'ডেলিভারি',
            'room_service' => 'রুম সার্ভিস',
        ],
    ],
    'reservation' => [
        'title' => 'টেবিল বুকিং · :name',
        'body' => ':count জন অতিথি · :date, :time · #:code',
    ],
    // Hotels: a room booking or an event (banquet) enquiry from the website.
    'hotel' => [
        'room_title' => 'রুম বুকিং · :name',
        'room_body' => ':check_in → :check_out · #:code',
        'event_title' => 'অনুষ্ঠানের জিজ্ঞাসা · :name',
        'event_body' => ':type · :date',
        'event_types' => [
            'wedding' => 'বিয়ে',
            'birthday' => 'জন্মদিন',
            'anniversary' => 'বিবাহবার্ষিকী',
            'corporate' => 'কর্পোরেট অনুষ্ঠান',
            'other' => 'অন্য অনুষ্ঠান',
        ],
    ],
    'tiffin' => [
        'title' => 'টিফিনের অনুরোধ · :name',
        'body' => ':plan · :date থেকে · :code',
        'default_plan' => 'মিল প্ল্যান',
    ],
    'push_test' => 'টেস্ট অ্যালার্ট: এই ডিভাইসে পুশ নোটিফিকেশন কাজ করছে।',
];
