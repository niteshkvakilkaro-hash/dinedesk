<?php

return [
    'summary' => [
        'title' => ':business · :date-এর সারাংশ',
        'title_so_far' => ':business · আজ এখন পর্যন্ত (:date, :time)',
        'sales' => 'অর্ডার: :orders · বিক্রি: ₹:amount',
        'no_orders' => 'এই দিনে কোনো অর্ডার নেই।',
        'types' => [
            'dine_in' => 'ডাইন-ইন',
            'takeaway' => 'টেকঅ্যাওয়ে',
            'delivery' => 'ডেলিভারি',
            'room_service' => 'রুম সার্ভিস',
        ],
        'top' => 'সেরা পদ: :dishes',
        'bookings' => 'টেবিল বুকিং: :count · অতিথি: :guests',
        'hotel' => 'রুম: :occupancy% ভর্তি · আজ চেক-ইন: :checkins',
        'low_stock' => 'স্টক কম (:count): :names',
        'tiffin' => 'টিফিন: :active চালু · আজকের খাবার: :lunch দুপুর, :dinner রাত',
        'tiffin_requests' => 'নতুন টিফিন অনুরোধ: :count',
        'link' => 'পুরো রিপোর্ট: :url',
    ],
    // Refer a business: a business that signed up with the owner's link started paying.
    'referral' => [
        'subject' => ':business আপনার লিংকে যোগ দিয়েছে: আপনার জন্য :days দিন বিনামূল্যে',
        'paid' => ':business আপনার রেফারেল লিংক দিয়ে সাইন আপ করে পেইড প্ল্যান শুরু করেছে।',
        'applied_trial' => 'আমরা আপনার ট্রায়ালে :days দিন বিনামূল্যে যোগ করেছি। এটি এখন :date তারিখে শেষ হবে।',
        'applied_period' => 'আমরা :days দিন বিনামূল্যে যোগ করেছি। আপনার প্ল্যান এখন :date পর্যন্ত চলবে।',
        'pending' => 'আপনার প্ল্যান নিজে থেকে রিনিউ হয়, তাই আপনার :days বিনামূল্যের দিন আপাতত ক্রেডিট হিসেবে রাখা আছে। আমাদের টিম এগুলো যোগ করে দেবে, অথবা প্ল্যান রিনিউ হওয়া বন্ধ হলে এগুলো নিজে থেকেই যোগ হবে।',
        'thanks' => 'আমাদের কথা অন্যদের বলার জন্য ধন্যবাদ!',
        'link' => 'আপনার রেফারেল: :url',
    ],
];
