<?php

return [
    'order' => [
        'placed' => ':business: আপনার অর্ডার #:number (₹:total) আমরা পেয়েছি। এখানে ট্র্যাক করুন: :url',
        'confirmed' => ':business আপনার অর্ডার #:number কনফার্ম করেছে। ট্র্যাক করুন: :url',
        'ready_takeaway' => ':business: আপনার অর্ডার #:number পিকআপের জন্য তৈরি।',
        'ready_dine_in' => ':business: আপনার অর্ডার #:number তৈরি।',
        'out_for_delivery' => ':business: আপনার অর্ডার #:number ডেলিভারির জন্য বেরিয়ে গেছে। ট্র্যাক করুন: :url',
        'completed' => ':business থেকে অর্ডার করার জন্য ধন্যবাদ! অর্ডার #:number সম্পূর্ণ হয়েছে।',
        'cancelled' => 'দুঃখিত, :business আপনার অর্ডার #:number বাতিল করতে বাধ্য হয়েছে। কারণ: :reason',
        'subject' => ':business — অর্ডার #:number',
        'button' => 'অর্ডার দেখুন',
    ],

    'reservation' => [
        'received' => ':business: :when, :party জন্য টেবিলের আপনার অনুরোধ আমরা পেয়েছি। বুকিং ID :code। শীঘ্রই কনফার্ম করব: :url',
        'confirmed' => ':business: :when, :party জন্য আপনার টেবিল কনফার্ম হয়েছে। বুকিং ID :code। এখানে দেখুন: :url',
        'rejected' => 'দুঃখিত, :business আপনার বুকিং (:when, ID :code) নিতে পারছে না।:reason',
        'cancelled' => ':business: আপনার বুকিং (:when, ID :code) বাতিল হয়েছে।:reason',
        'reminder' => 'মনে করিয়ে দিচ্ছি: :business-এ :when, :party জন্য আপনার টেবিল বুক করা আছে। বুকিং ID :code। বাতিল করতে চান? :url',
        'party' => ':count জনের',
        'subject' => ':business — বুকিং :code',
        'button' => 'বুকিং দেখুন',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) রুমের জন্য আপনার অনুরোধ আমরা পেয়েছি। বুকিং ID :code। শীঘ্রই কনফার্ম করব: :url',
        'confirmed' => ':business: :dates (:nights) আপনার রুম কনফার্ম হয়েছে। বুকিং ID :code। চেক-ইন :checkin থেকে। বিস্তারিত: :url',
        'cancelled' => ':business: :dates আপনার রুম বুকিং (ID :code) বাতিল হয়েছে।:reason',
        'nights' => ':count রাত',
        'subject' => ':business — রুম বুকিং :code',
        'button' => 'বুকিং দেখুন',
    ],

    'tiffin' => [
        'confirmed' => ':business: আপনার টিফিন প্ল্যান :plan নিশ্চিত হয়েছে (সাবস্ক্রিপশন :code)। খাবার পাবেন :from থেকে :until পর্যন্ত।',
        'declined' => 'দুঃখিত, :business আপনার টিফিন প্ল্যান :plan শুরু করতে পারছে না (অনুরোধ :code)। কোনো প্রশ্ন থাকলে আমাদের ফোন করুন।',
        'paused' => ':business: আপনার টিফিন সাবস্ক্রিপশন :code স্থগিত করা হয়েছে। আবার চালু না হওয়া পর্যন্ত খাবার আসবে না।',
        'resumed' => ':business: আপনার টিফিন সাবস্ক্রিপশন :code আবার চালু হয়েছে। এটি এখন :until পর্যন্ত চলবে।',
        'cancelled' => ':business-এ আপনার টিফিন সাবস্ক্রিপশন :code বাতিল করা হয়েছে।',
        'default_plan' => 'টিফিন',
        'subject' => ':business — টিফিন :code',
    ],

    'reason' => 'কারণ: :reason',

    'mail' => [
        'greeting' => 'নমস্কার!',
        'salutation' => 'ধন্যবাদ, :business',
    ],
];
