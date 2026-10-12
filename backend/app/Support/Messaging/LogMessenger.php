<?php

namespace App\Support\Messaging;

use Illuminate\Support\Facades\Log;

class LogMessenger implements Messenger
{
    public function send(string $channel, string $to, string $text, ?string $code = null): void
    {
        Log::info("[{$channel} → {$to}] {$text}");
    }
}
