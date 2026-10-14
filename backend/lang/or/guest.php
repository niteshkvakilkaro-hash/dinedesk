<?php

return [
    'order' => [
        'placed' => ':business: ଆପଣଙ୍କ ଅର୍ଡର #:number (₹:total) ମିଳିଛି। ଏଠାରେ ଟ୍ରାକ୍ କରନ୍ତୁ: :url',
        'confirmed' => ':business ଆପଣଙ୍କ ଅର୍ଡର #:number କନଫର୍ମ କରିଛି। ଟ୍ରାକ୍ କରନ୍ତୁ: :url',
        'ready_takeaway' => ':business: ଆପଣଙ୍କ ଅର୍ଡର #:number ପିକଅପ୍ ପାଇଁ ପ୍ରସ୍ତୁତ।',
        'ready_dine_in' => ':business: ଆପଣଙ୍କ ଅର୍ଡର #:number ପ୍ରସ୍ତୁତ।',
        'out_for_delivery' => ':business: ଆପଣଙ୍କ ଅର୍ଡର #:number ଡେଲିଭରି ପାଇଁ ବାହାରି ସାରିଛି। ଟ୍ରାକ୍ କରନ୍ତୁ: :url',
        'completed' => ':business ରୁ ଅର୍ଡର କରିଥିବାରୁ ଧନ୍ୟବାଦ! ଅର୍ଡର #:number ସମ୍ପୂର୍ଣ୍ଣ ହେଲା।',
        'cancelled' => 'ଦୁଃଖିତ, :business କୁ ଆପଣଙ୍କ ଅର୍ଡର #:number ବାତିଲ କରିବାକୁ ପଡ଼ିଲା। କାରଣ: :reason',
        'subject' => ':business — ଅର୍ଡର #:number',
        'button' => 'ଅର୍ଡର ଦେଖନ୍ତୁ',
    ],

    'reservation' => [
        'received' => ':business: :when, :party ପାଇଁ ଟେବୁଲ୍ ଅନୁରୋଧ ମିଳିଛି। ବୁକିଂ ID :code। ଶୀଘ୍ର କନଫର୍ମ କରିବୁ: :url',
        'confirmed' => ':business: :when, :party ପାଇଁ ଆପଣଙ୍କ ଟେବୁଲ୍ କନଫର୍ମ ହୋଇଛି। ବୁକିଂ ID :code। ଏଠାରେ ଦେଖନ୍ତୁ: :url',
        'rejected' => 'ଦୁଃଖିତ, :business ଆପଣଙ୍କ ବୁକିଂ (:when, ID :code) ନେଇପାରିବ ନାହିଁ।:reason',
        'cancelled' => ':business: ଆପଣଙ୍କ ବୁକିଂ (:when, ID :code) ବାତିଲ ହୋଇଛି।:reason',
        'reminder' => 'ମନେ ପକାଉଛୁ: :business ରେ :when, :party ପାଇଁ ଆପଣଙ୍କ ଟେବୁଲ୍ ବୁକ୍ ଅଛି। ବୁକିଂ ID :code। ବାତିଲ କରିବେ କି? :url',
        'party' => ':count ଜଣଙ୍କ',
        'subject' => ':business — ବୁକିଂ :code',
        'button' => 'ବୁକିଂ ଦେଖନ୍ତୁ',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) ପାଇଁ ଆପଣଙ୍କ ରୁମ୍ ଅନୁରୋଧ ମିଳିଛି। ବୁକିଂ ID :code। ଶୀଘ୍ର କନଫର୍ମ କରିବୁ: :url',
        'confirmed' => ':business: :dates (:nights) ପାଇଁ ଆପଣଙ୍କ ରୁମ୍ କନଫର୍ମ ହୋଇଛି। ବୁକିଂ ID :code। ଚେକ୍-ଇନ୍ :checkin ରୁ। ବିବରଣୀ: :url',
        'cancelled' => ':business: :dates ପାଇଁ ଆପଣଙ୍କ ରୁମ୍ ବୁକିଂ (ID :code) ବାତିଲ ହୋଇଛି।:reason',
        'nights' => ':count ରାତି',
        'subject' => ':business — ରୁମ୍ ବୁକିଂ :code',
        'button' => 'ବୁକିଂ ଦେଖନ୍ତୁ',
    ],

    'tiffin' => [
        'confirmed' => ':business: ଆପଣଙ୍କ ଟିଫିନ ପ୍ଲାନ :plan ନିଶ୍ଚିତ ହୋଇଛି (ସବସ୍କ୍ରିପସନ :code)। :from ରୁ :until ପର୍ଯ୍ୟନ୍ତ ଖାଦ୍ୟ ମିଳିବ।',
        'declined' => 'ଦୁଃଖିତ, :business ଆପଣଙ୍କ ଟିଫିନ ପ୍ଲାନ :plan ଆରମ୍ଭ କରିପାରିବ ନାହିଁ (ଅନୁରୋଧ :code)। କିଛି ପ୍ରଶ୍ନ ଥିଲେ ଆମକୁ କଲ କରନ୍ତୁ।',
        'paused' => ':business: ଆପଣଙ୍କ ଟିଫିନ ସବସ୍କ୍ରିପସନ :code ବନ୍ଦ ରଖାଯାଇଛି। ପୁଣି ଆରମ୍ଭ ହେବା ପର୍ଯ୍ୟନ୍ତ ଖାଦ୍ୟ ଆସିବ ନାହିଁ।',
        'resumed' => ':business: ଆପଣଙ୍କ ଟିଫିନ ସବସ୍କ୍ରିପସନ :code ପୁଣି ଆରମ୍ଭ ହୋଇଛି। ଏହା ଏବେ :until ପର୍ଯ୍ୟନ୍ତ ଚାଲିବ।',
        'cancelled' => ':business ସହ ଆପଣଙ୍କ ଟିଫିନ ସବସ୍କ୍ରିପସନ :code ବାତିଲ କରାଯାଇଛି।',
        'default_plan' => 'ଟିଫିନ',
        'subject' => ':business — ଟିଫିନ :code',
    ],

    'reason' => 'କାରଣ: :reason',

    'mail' => [
        'greeting' => 'ନମସ୍କାର!',
        'salutation' => 'ଧନ୍ୟବାଦ, :business',
    ],
];
