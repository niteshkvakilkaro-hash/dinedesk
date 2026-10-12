<?php

namespace App\Support\Messaging;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Real delivery, on the platform's own accounts (keys in .env, never per business):
 *
 * - WhatsApp: Meta WhatsApp Cloud API. Messages a business starts must use an approved
 *   template, so every update goes through one utility template whose body is a single
 *   variable ({{1}}) holding the finished text (WHATSAPP_TEMPLATE).
 * - SMS: MSG91, for one-time codes only (sign-in and loyalty codes) through a DLT-approved
 *   OTP template (MSG91_OTP_TEMPLATE_ID). Indian SMS must match a DLT template and each
 *   variable holds ~30 characters, so free-text order updates can't go by SMS; they are
 *   skipped with a warning (use WhatsApp or email for those).
 *
 * A channel without keys is skipped with a warning rather than failing the request.
 * A provider error throws, so a queued notification is retried.
 */
class LiveMessenger implements Messenger
{
    public function send(string $channel, string $to, string $text, ?string $code = null): void
    {
        $digits = self::digits($to);
        if ($digits === null) {
            Log::warning("[{$channel}] not sent: '{$to}' is not an Indian mobile number.");

            return;
        }
        match ($channel) {
            'whatsapp' => $this->whatsapp($digits, $text),
            'sms' => $this->sms($digits, $text, $code),
            default => Log::warning("[{$channel}] unknown channel, not sent."),
        };
    }

    public static function whatsappReady(): bool
    {
        $c = config('dinedesk.messaging.whatsapp');

        return filled($c['token']) && filled($c['phone_number_id']) && filled($c['template']);
    }

    public static function smsReady(): bool
    {
        $c = config('dinedesk.messaging.sms');

        return filled($c['auth_key']) && filled($c['otp_template_id']);
    }

    /** "+919829012345" → "919829012345" (what both providers expect). */
    public static function digits(string $to): ?string
    {
        $d = preg_replace('/\D+/', '', $to);
        if (strlen($d) === 10) {
            $d = '91'.$d;
        }

        return preg_match('/^91[6-9]\d{9}$/', $d) ? $d : null;
    }

    private function whatsapp(string $to, string $text): void
    {
        if (! self::whatsappReady()) {
            Log::warning('[whatsapp] not sent: WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEMPLATE are not set.');

            return;
        }
        $c = config('dinedesk.messaging.whatsapp');
        // Template variables may not contain new lines, tabs or more than four spaces in a row.
        $param = mb_substr(trim(preg_replace('/\s+/u', ' ', $text)), 0, 1000);
        $res = Http::withToken($c['token'])->acceptJson()->timeout(15)
            ->post("https://graph.facebook.com/{$c['api_version']}/{$c['phone_number_id']}/messages", [
                'messaging_product' => 'whatsapp',
                'to' => $to,
                'type' => 'template',
                'template' => [
                    'name' => $c['template'],
                    'language' => ['code' => $c['language']],
                    'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $param]]]],
                ],
            ]);
        if ($res->failed()) {
            throw new RuntimeException('WhatsApp send failed ('.$res->status().'): '.mb_substr($res->body(), 0, 300));
        }
    }

    private function sms(string $to, string $text, ?string $code): void
    {
        if ($code === null) {
            Log::warning('[sms] not sent: SMS in India needs a DLT template per message, so only codes go by SMS. Use WhatsApp or email for updates.');

            return;
        }
        if (! self::smsReady()) {
            Log::warning('[sms] not sent: MSG91_AUTH_KEY / MSG91_OTP_TEMPLATE_ID are not set.');

            return;
        }
        $c = config('dinedesk.messaging.sms');
        $res = Http::withHeaders(['authkey' => $c['auth_key']])->acceptJson()->timeout(15)
            ->post('https://control.msg91.com/api/v5/flow', [
                'template_id' => $c['otp_template_id'],
                'short_url' => '0',
                'recipients' => [['mobiles' => $to, $c['code_variable'] => $code]],
            ]);
        if ($res->failed() || $res->json('type') === 'error') {
            throw new RuntimeException('SMS send failed ('.$res->status().'): '.mb_substr($res->body(), 0, 300));
        }
    }
}
