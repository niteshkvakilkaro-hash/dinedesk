<?php

return [
    'order' => [
        'placed' => ':business: ਤੁਹਾਡਾ ਆਰਡਰ #:number (₹:total) ਮਿਲ ਗਿਆ ਹੈ। ਇੱਥੇ ਟ੍ਰੈਕ ਕਰੋ: :url',
        'confirmed' => ':business ਨੇ ਤੁਹਾਡਾ ਆਰਡਰ #:number ਕਨਫ਼ਰਮ ਕਰ ਦਿੱਤਾ ਹੈ। ਟ੍ਰੈਕ ਕਰੋ: :url',
        'ready_takeaway' => ':business ਤੋਂ ਤੁਹਾਡਾ ਆਰਡਰ #:number ਪਿਕਅੱਪ ਲਈ ਤਿਆਰ ਹੈ।',
        'ready_dine_in' => ':business ਤੋਂ ਤੁਹਾਡਾ ਆਰਡਰ #:number ਤਿਆਰ ਹੈ।',
        'out_for_delivery' => ':business ਤੋਂ ਤੁਹਾਡਾ ਆਰਡਰ #:number ਡਿਲੀਵਰੀ ਲਈ ਨਿਕਲ ਚੁੱਕਾ ਹੈ। ਟ੍ਰੈਕ ਕਰੋ: :url',
        'completed' => ':business ਤੋਂ ਆਰਡਰ ਕਰਨ ਲਈ ਧੰਨਵਾਦ! ਆਰਡਰ #:number ਪੂਰਾ ਹੋਇਆ।',
        'cancelled' => 'ਮਾਫ਼ ਕਰਨਾ, :business ਨੂੰ ਤੁਹਾਡਾ ਆਰਡਰ #:number ਰੱਦ ਕਰਨਾ ਪਿਆ। ਕਾਰਨ: :reason',
        'subject' => ':business — ਆਰਡਰ #:number',
        'button' => 'ਆਰਡਰ ਵੇਖੋ',
    ],

    'reservation' => [
        'received' => ':business: :when, :party ਲਈ ਟੇਬਲ ਦੀ ਤੁਹਾਡੀ ਬੇਨਤੀ ਮਿਲ ਗਈ ਹੈ। ਬੁਕਿੰਗ ID :code। ਅਸੀਂ ਜਲਦੀ ਕਨਫ਼ਰਮ ਕਰਾਂਗੇ: :url',
        'confirmed' => ':business: :when, :party ਲਈ ਤੁਹਾਡਾ ਟੇਬਲ ਕਨਫ਼ਰਮ ਹੈ। ਬੁਕਿੰਗ ID :code। ਇੱਥੇ ਵੇਖੋ: :url',
        'rejected' => 'ਮਾਫ਼ ਕਰਨਾ, :business :when ਦੀ ਤੁਹਾਡੀ ਬੁਕਿੰਗ (ID :code) ਨਹੀਂ ਲੈ ਸਕਦਾ।:reason',
        'cancelled' => ':business ਵਿੱਚ :when ਦੀ ਤੁਹਾਡੀ ਬੁਕਿੰਗ (ID :code) ਰੱਦ ਹੋ ਗਈ ਹੈ।:reason',
        'reminder' => 'ਯਾਦ ਦਿਵਾ ਦੇਈਏ: :business ਵਿੱਚ :party ਲਈ ਤੁਹਾਡਾ ਟੇਬਲ :when ਬੁੱਕ ਹੈ। ਬੁਕਿੰਗ ID :code। ਰੱਦ ਕਰਨਾ ਹੈ? :url',
        'party' => '{1} :count ਵਿਅਕਤੀ|[2,*] :count ਲੋਕਾਂ',
        'subject' => ':business — ਬੁਕਿੰਗ :code',
        'button' => 'ਬੁਕਿੰਗ ਵੇਖੋ',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) ਲਈ ਤੁਹਾਡੀ ਕਮਰੇ ਦੀ ਬੇਨਤੀ ਮਿਲ ਗਈ ਹੈ। ਬੁਕਿੰਗ ID :code। ਅਸੀਂ ਜਲਦੀ ਕਨਫ਼ਰਮ ਕਰਾਂਗੇ: :url',
        'confirmed' => ':business: :dates (:nights) ਲਈ ਤੁਹਾਡਾ ਕਮਰਾ ਕਨਫ਼ਰਮ ਹੈ। ਬੁਕਿੰਗ ID :code। ਚੈੱਕ-ਇਨ :checkin ਤੋਂ। ਵੇਰਵੇ: :url',
        'cancelled' => ':business ਵਿੱਚ :dates ਦੀ ਤੁਹਾਡੀ ਕਮਰਾ ਬੁਕਿੰਗ (ID :code) ਰੱਦ ਹੋ ਗਈ ਹੈ।:reason',
        'nights' => '{1} :count ਰਾਤ|[2,*] :count ਰਾਤਾਂ',
        'subject' => ':business — ਕਮਰਾ ਬੁਕਿੰਗ :code',
        'button' => 'ਬੁਕਿੰਗ ਵੇਖੋ',
    ],

    'tiffin' => [
        'confirmed' => ':business: ਤੁਹਾਡਾ ਟਿਫ਼ਨ ਪਲਾਨ :plan ਪੱਕਾ ਹੋ ਗਿਆ ਹੈ (ਸਬਸਕ੍ਰਿਪਸ਼ਨ :code)। ਖਾਣਾ :from ਤੋਂ :until ਤੱਕ ਮਿਲੇਗਾ।',
        'declined' => 'ਮਾਫ਼ ਕਰਨਾ, :business ਤੁਹਾਡਾ ਟਿਫ਼ਨ ਪਲਾਨ :plan ਸ਼ੁਰੂ ਨਹੀਂ ਕਰ ਸਕਦਾ (ਬੇਨਤੀ :code)। ਕੋਈ ਸਵਾਲ ਹੋਵੇ ਤਾਂ ਸਾਨੂੰ ਕਾਲ ਕਰੋ।',
        'paused' => ':business: ਤੁਹਾਡੀ ਟਿਫ਼ਨ ਸਬਸਕ੍ਰਿਪਸ਼ਨ :code ਰੋਕ ਦਿੱਤੀ ਗਈ ਹੈ। ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋਣ ਤੱਕ ਖਾਣਾ ਨਹੀਂ ਆਵੇਗਾ।',
        'resumed' => ':business: ਤੁਹਾਡੀ ਟਿਫ਼ਨ ਸਬਸਕ੍ਰਿਪਸ਼ਨ :code ਦੁਬਾਰਾ ਸ਼ੁਰੂ ਹੋ ਗਈ ਹੈ। ਹੁਣ ਇਹ :until ਤੱਕ ਚੱਲੇਗੀ।',
        'cancelled' => ':business ਨਾਲ ਤੁਹਾਡੀ ਟਿਫ਼ਨ ਸਬਸਕ੍ਰਿਪਸ਼ਨ :code ਰੱਦ ਕਰ ਦਿੱਤੀ ਗਈ ਹੈ।',
        'default_plan' => 'ਟਿਫ਼ਨ',
        'subject' => ':business — ਟਿਫ਼ਨ :code',
    ],

    'reason' => 'ਕਾਰਨ: :reason',

    'mail' => [
        'greeting' => 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ!',
        'salutation' => 'ਧੰਨਵਾਦ, :business',
    ],
];
