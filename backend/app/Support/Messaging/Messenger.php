<?php

namespace App\Support\Messaging;

/**
 * Sends a WhatsApp or SMS text. The provider is configured, not hard-coded:
 * MESSAGING_DRIVER=log (development: writes to the log) or live (LiveMessenger:
 * WhatsApp through Meta's Cloud API, SMS codes through MSG91).
 */
interface Messenger
{
    /**
     * @param  'whatsapp'|'sms'  $channel
     * @param  string|null  $code  set for one-time codes, which go through a provider's code template
     */
    public function send(string $channel, string $to, string $text, ?string $code = null): void;
}
