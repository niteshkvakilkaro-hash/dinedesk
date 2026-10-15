<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notify\Support\VapidKeys;
use App\Modules\Subscriptions\Services\PlatformRazorpay;
use App\Modules\Subscriptions\Services\SubscriptionManager;
use App\Support\Ai\Ai;
use App\Support\ApiException;
use App\Support\Messaging\LiveMessenger;
use App\Support\Messaging\Messenger;
use App\Support\PlatformConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Super admin → Integrations: the platform's own Razorpay, AI, WhatsApp, SMS, email and web push
 * keys. Secrets are stored encrypted and never sent back (only "set" and the last 4 characters);
 * saving or removing one needs the admin's password. Every change is audited by field name,
 * never by value. Anything not saved here comes from the server .env.
 */
class IntegrationController extends Controller
{
    /** Integrations edited with the form (web push keys are only generated). */
    private const EDITABLE = ['razorpay', 'ai', 'whatsapp', 'sms', 'messaging', 'mail'];

    public function __construct(private readonly PlatformConfig $config) {}

    public function show(): JsonResponse
    {
        return $this->ok($this->payload());
    }

    public function update(Request $request, string $integration): JsonResponse
    {
        abort_unless(in_array($integration, self::EDITABLE, true), 404);
        $fields = PlatformConfig::FIELDS[$integration];
        $rules = ['values' => ['present', 'array'], 'remove' => ['nullable', 'array'], 'remove.*' => ['string', 'in:'.implode(',', array_keys($fields))]];
        foreach ($fields as $field => [, , $fieldRules]) {
            $rules["values.{$field}"] = array_merge(['nullable'], $field === 'port' ? [] : ['string'], $fieldRules);
        }
        $values = (array) $request->input('values', []);
        $remove = (array) $request->input('remove', []);
        // A new or removed secret needs the admin's own password again.
        $touchesSecret = (bool) array_filter(array_keys($fields), fn ($f) => PlatformConfig::isSecret($integration, $f)
            && (in_array($f, $remove, true) || filled($values[$f] ?? null)));
        $rules['current_password'] = [$touchesSecret ? 'required' : 'nullable', 'string', 'current_password:sanctum'];
        $data = $request->validate($rules, [
            'current_password.required' => 'Enter your password to save a secret key.',
            'current_password.current_password' => 'That password is not correct.',
            'values.key_id.regex' => 'A Razorpay key ID starts with rzp_test_ or rzp_live_.',
            'values.phone_number_id.regex' => 'The phone number ID is a number (WhatsApp Manager → API setup).',
            'values.template.regex' => 'Template names use lower-case letters, digits and _.',
            'values.language.regex' => 'Use a language code like en or en_US.',
            'values.api_version.regex' => 'Use a version like v21.0.',
        ]);
        $values = array_intersect_key((array) $data['values'], $fields);
        if (isset($values['from_name'])) {
            $values['from_name'] = strip_tags((string) $values['from_name']);
        }

        $result = $this->config->save($integration, $values, $data['remove'] ?? [], $request->user()->id);
        if ($result['changed'] || $result['removed']) {
            // Field names only: never the values.
            AuditLog::record('platform.integrations.updated', null, ['integration' => $integration] + $result, null);
        }

        return $this->ok($this->payload(), $result['changed'] || $result['removed'] ? 'Saved.' : 'Nothing changed.');
    }

    /** New VAPID keys for Web Push (the same as php artisan webpush:vapid). */
    public function generateVapid(Request $request): JsonResponse
    {
        $request->validate(['current_password' => ['required', 'string', 'current_password:sanctum']], [
            'current_password.required' => 'Enter your password to save a secret key.',
            'current_password.current_password' => 'That password is not correct.',
        ]);
        $keys = VapidKeys::create();
        $this->config->save('webpush', ['public_key' => $keys['publicKey'], 'private_key' => $keys['privateKey']], [], $request->user()->id);
        AuditLog::record('platform.integrations.updated', null, ['integration' => 'webpush', 'changed' => ['public_key', 'private_key'], 'removed' => [], 'generated' => true], null);

        return $this->ok($this->payload(), 'New keys saved. Staff need to switch alerts on again on their phones.');
    }

    /** "Test": a real, cheap call with the keys in use now. Always 200 with {ok, message}. */
    public function test(Request $request, string $integration): JsonResponse
    {
        $data = $request->validate(match ($integration) {
            'whatsapp', 'sms' => ['phone' => ['required', 'string', 'max:20']],
            'mail' => ['email' => ['required', 'email:rfc', 'max:160']],
            'razorpay', 'ai' => [],
            default => abort(404),
        });
        try {
            $message = match ($integration) {
                'razorpay' => $this->testRazorpay(),
                'ai' => $this->testAi(),
                'whatsapp', 'sms' => $this->testMessage($integration, $data['phone']),
                'mail' => $this->testMail($data['email']),
            };
            $ok = true;
        } catch (ApiException $e) {
            [$ok, $message] = [false, $e->getMessage()];
        } catch (Throwable $e) {
            report($e);
            [$ok, $message] = [false, mb_substr($e->getMessage(), 0, 300) ?: 'The test failed.'];
        }
        AuditLog::record('platform.integrations.tested', null, ['integration' => $integration, 'ok' => $ok], null);

        return $this->ok(['ok' => $ok, 'message' => $message]);
    }

    private function testRazorpay(): string
    {
        $c = config('dinedesk.platform_razorpay');
        if (! app(PlatformRazorpay::class)->configured()) {
            throw new ApiException('Enter the key ID and key secret first.', 422);
        }
        $r = Http::withBasicAuth($c['key_id'], $c['key_secret'])->acceptJson()->timeout(15)->get(PlatformRazorpay::API.'/plans', ['count' => 1]);
        if (! $r->successful()) {
            throw new ApiException('Razorpay said: '.($r->json('error.description') ?: 'HTTP '.$r->status()), 422);
        }

        return str_starts_with((string) $c['key_id'], 'rzp_live_') ? 'Connected to Razorpay (live keys).' : 'Connected to Razorpay (test keys).';
    }

    private function testAi(): string
    {
        $ai = app(Ai::class);
        if (! $ai->enabled()) {
            throw new ApiException('Enter the API key first.', 422);
        }
        try {
            $ai->json('Answer with {"ok": true}.', [['type' => 'text', 'text' => 'Connection test.']], [
                'type' => 'object', 'properties' => ['ok' => ['type' => 'boolean']], 'required' => ['ok'], 'additionalProperties' => false,
            ], 200);
        } catch (ApiException $e) {
            // The API answered (the key works), it just stopped early or declined.
            if (! in_array($e->errorCode, ['ai_too_long', 'ai_refused'], true)) {
                throw $e;
            }
        }

        return 'Connected to Claude ('.config('dinedesk.ai.model').').';
    }

    private function testMessage(string $channel, string $phone): string
    {
        if (LiveMessenger::digits($phone) === null) {
            throw new ApiException('Enter an Indian mobile number (10 digits).', 422);
        }
        $live = config('dinedesk.messaging.driver') === 'live';
        if ($live && ! ($channel === 'whatsapp' ? LiveMessenger::whatsappReady() : LiveMessenger::smsReady())) {
            throw new ApiException($channel === 'whatsapp' ? 'Enter the access token, phone number ID and template first.' : 'Enter the auth key and OTP template ID first.', 422);
        }
        $code = (string) random_int(100000, 999999);
        app(Messenger::class)->send($channel, $phone, $channel === 'sms' ? "{$code} is your DineDesk test code." : 'DineDesk test message: WhatsApp updates are set up.', $channel === 'sms' ? $code : null);

        return $live ? 'Sent. Check the phone.' : 'Messaging is in "Log only" mode: the message was written to the server log, not sent. Switch to Live to send real messages.';
    }

    private function testMail(string $to): string
    {
        Mail::raw('This is a test email from DineDesk. Email is set up.', fn ($m) => $m->to($to)->subject('DineDesk test email'));
        $mailer = (string) config('mail.default');

        return in_array($mailer, ['log', 'array'], true)
            ? "The server's mailer is \"{$mailer}\": the email was written to the log, not sent. Save an SMTP host to send real email."
            : 'Sent. Check the inbox (and the spam folder).';
    }

    private function payload(): array
    {
        $c = $this->config;

        return [
            'integrations' => $c->describe(),
            'ready' => [
                'razorpay' => app(PlatformRazorpay::class)->configured(),
                'ai' => app(Ai::class)->enabled(),
                'whatsapp' => LiveMessenger::whatsappReady(),
                'sms' => LiveMessenger::smsReady(),
                'mail' => config('mail.default') === 'smtp',
                'webpush' => filled(config('dinedesk.webpush.public_key')) && filled(config('dinedesk.webpush.private_key')),
            ],
            'mailer' => config('mail.default'),
            'webhook_url' => url('/api/v1/webhooks/razorpay-platform'),
            'webhook_events' => SubscriptionManager::WEBHOOK_EVENTS,
        ];
    }
}
