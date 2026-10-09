<?php

namespace App\Support\Messaging;

/**
 * Sends a WhatsApp or SMS text. The provider is configured, not hard-coded:
 * MESSAGING_DRIVER=log (development: writes to the log) or a real provider
 * driver added later (Gupshup, MSG91, Twilio...) implementing this interface.
 */
interface Messenger
{
    /** @param 'whatsapp'|'sms' $channel */
    public function send(string $channel, string $to, string $text): void;
}
