<?php

return [
    'order' => [
        'placed' => ':business: നിങ്ങളുടെ ഓർഡർ #:number (₹:total) ലഭിച്ചു. ഇവിടെ ട്രാക്ക് ചെയ്യാം: :url',
        'confirmed' => ':business: നിങ്ങളുടെ ഓർഡർ #:number സ്ഥിരീകരിച്ചു. ട്രാക്ക് ചെയ്യാം: :url',
        'ready_takeaway' => ':business: നിങ്ങളുടെ ഓർഡർ #:number പിക്കപ്പിന് തയ്യാറാണ്.',
        'ready_dine_in' => ':business: നിങ്ങളുടെ ഓർഡർ #:number തയ്യാറാണ്.',
        'out_for_delivery' => ':business: നിങ്ങളുടെ ഓർഡർ #:number ഡെലിവറിക്കായി പുറപ്പെട്ടു. ട്രാക്ക് ചെയ്യാം: :url',
        'completed' => ':business: ഓർഡർ ചെയ്തതിന് നന്ദി! ഓർഡർ #:number പൂർത്തിയായി.',
        'cancelled' => ':business: ക്ഷമിക്കണം, നിങ്ങളുടെ ഓർഡർ #:number റദ്ദാക്കേണ്ടി വന്നു. കാരണം: :reason',
        'subject' => ':business — ഓർഡർ #:number',
        'button' => 'ഓർഡർ കാണുക',
    ],

    'reservation' => [
        'received' => ':business: :when, :party ടേബിളിനുള്ള നിങ്ങളുടെ അഭ്യർത്ഥന ലഭിച്ചു. ബുക്കിംഗ് ID :code. ഉടൻ സ്ഥിരീകരിക്കും: :url',
        'confirmed' => ':business: :when, :party നിങ്ങളുടെ ടേബിൾ സ്ഥിരീകരിച്ചു. ബുക്കിംഗ് ID :code. ഇവിടെ കാണാം: :url',
        'rejected' => 'ക്ഷമിക്കണം, :business നിങ്ങളുടെ ബുക്കിംഗ് (:when, ID :code) സ്വീകരിക്കാൻ കഴിയില്ല.:reason',
        'cancelled' => ':business: നിങ്ങളുടെ ബുക്കിംഗ് (:when, ID :code) റദ്ദാക്കി.:reason',
        'reminder' => 'ഓർമ്മപ്പെടുത്തൽ: :business, :when, :party നിങ്ങളുടെ ടേബിൾ ബുക്ക് ചെയ്തിട്ടുണ്ട്. ബുക്കിംഗ് ID :code. റദ്ദാക്കണോ? :url',
        'party' => '{1} :count ആൾക്ക്|[2,*] :count പേർക്ക്',
        'subject' => ':business — ബുക്കിംഗ് :code',
        'button' => 'ബുക്കിംഗ് കാണുക',
    ],

    'stay' => [
        'received' => ':business: :dates (:nights) മുറിക്കുള്ള നിങ്ങളുടെ അഭ്യർത്ഥന ലഭിച്ചു. ബുക്കിംഗ് ID :code. ഉടൻ സ്ഥിരീകരിക്കും: :url',
        'confirmed' => ':business: :dates (:nights) നിങ്ങളുടെ മുറി സ്ഥിരീകരിച്ചു. ബുക്കിംഗ് ID :code. ചെക്ക്-ഇൻ :checkin മുതൽ. വിശദാംശങ്ങൾ: :url',
        'cancelled' => ':business: :dates നിങ്ങളുടെ മുറി ബുക്കിംഗ് (ID :code) റദ്ദാക്കി.:reason',
        'nights' => '{1} :count രാത്രി|[2,*] :count രാത്രികൾ',
        'subject' => ':business — മുറി ബുക്കിംഗ് :code',
        'button' => 'ബുക്കിംഗ് കാണുക',
    ],

    'tiffin' => [
        'confirmed' => ':business: നിങ്ങളുടെ ടിഫിൻ പ്ലാൻ :plan സ്ഥിരീകരിച്ചു (സബ്സ്ക്രിപ്ഷൻ :code). :from മുതൽ :until വരെ ഭക്ഷണം ലഭിക്കും.',
        'declined' => 'ക്ഷമിക്കണം, :business-ന് നിങ്ങളുടെ ടിഫിൻ പ്ലാൻ :plan ആരംഭിക്കാൻ കഴിയില്ല (അഭ്യർത്ഥന :code). സംശയങ്ങളുണ്ടെങ്കിൽ ഞങ്ങളെ വിളിക്കുക.',
        'paused' => ':business: നിങ്ങളുടെ ടിഫിൻ സബ്സ്ക്രിപ്ഷൻ :code താൽക്കാലികമായി നിർത്തി. വീണ്ടും തുടങ്ങുന്നതുവരെ ഭക്ഷണം വരില്ല.',
        'resumed' => ':business: നിങ്ങളുടെ ടിഫിൻ സബ്സ്ക്രിപ്ഷൻ :code വീണ്ടും തുടങ്ങി. ഇനി ഇത് :until വരെ തുടരും.',
        'cancelled' => ':business-ലെ നിങ്ങളുടെ ടിഫിൻ സബ്സ്ക്രിപ്ഷൻ :code റദ്ദാക്കി.',
        'default_plan' => 'ടിഫിൻ',
        'subject' => ':business — ടിഫിൻ :code',
    ],

    'reason' => 'കാരണം: :reason',

    'mail' => [
        'greeting' => 'നമസ്കാരം!',
        'salutation' => 'നന്ദി, :business',
    ],
];
