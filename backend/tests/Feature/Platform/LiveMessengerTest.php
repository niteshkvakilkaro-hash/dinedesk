<?php

namespace Tests\Feature\Platform;

use App\Support\Messaging\LiveMessenger;
use App\Support\Messaging\Messenger;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

/** Real delivery: WhatsApp through Meta's Cloud API template, codes by SMS through MSG91. */
class LiveMessengerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'dinedesk.messaging.driver' => 'live',
            'dinedesk.messaging.whatsapp.token' => 'wa-token',
            'dinedesk.messaging.whatsapp.phone_number_id' => '1234567890',
            'dinedesk.messaging.whatsapp.template' => 'dinedesk_update',
            'dinedesk.messaging.sms.auth_key' => 'msg-key',
            'dinedesk.messaging.sms.otp_template_id' => 'tpl-otp',
        ]);
    }

    public function test_the_live_driver_is_bound(): void
    {
        $this->assertInstanceOf(LiveMessenger::class, app(Messenger::class));
    }

    public function test_whatsapp_goes_through_the_template_with_the_text_as_its_variable(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.1']]])]);

        app(Messenger::class)->send('whatsapp', '+919829012345', "Spice Route: we have received your order #12.\nTrack it here: https://x.test/o");

        Http::assertSent(function (Request $r) {
            $body = $r->data();

            return $r->url() === 'https://graph.facebook.com/v21.0/1234567890/messages'
                && $r->hasHeader('Authorization', 'Bearer wa-token')
                && $body['to'] === '919829012345'
                && $body['template']['name'] === 'dinedesk_update'
                // New lines are not allowed inside template variables.
                && $body['template']['components'][0]['parameters'][0]['text'] === 'Spice Route: we have received your order #12. Track it here: https://x.test/o';
        });
    }

    public function test_a_provider_error_throws_so_the_queued_message_is_retried(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['message' => 'bad token']], 401)]);

        $this->expectException(RuntimeException::class);
        app(Messenger::class)->send('whatsapp', '+919829012345', 'Hello');
    }

    public function test_codes_go_by_sms_through_the_otp_template(): void
    {
        Http::fake(['control.msg91.com/*' => Http::response(['type' => 'success'])]);

        app(Messenger::class)->send('sms', '+919829012345', '123456 is your code.', '123456');

        Http::assertSent(fn (Request $r) => $r->hasHeader('authkey', 'msg-key')
            && $r['template_id'] === 'tpl-otp'
            && $r['recipients'][0] === ['mobiles' => '919829012345', 'otp' => '123456']);
    }

    public function test_free_text_sms_missing_keys_and_bad_numbers_are_skipped_not_sent(): void
    {
        Http::fake();

        app(Messenger::class)->send('sms', '+919829012345', 'Your order is ready.');
        app(Messenger::class)->send('whatsapp', '12345', 'Hello');
        config(['dinedesk.messaging.whatsapp.token' => null]);
        app(Messenger::class)->send('whatsapp', '+919829012345', 'Hello');

        Http::assertNothingSent();
    }

    public function test_sign_in_codes_use_the_messenger_when_otp_driver_is_sms(): void
    {
        config(['dinedesk.otp.driver' => 'sms']);
        Http::fake(['control.msg91.com/*' => Http::response(['type' => 'success'])]);

        $this->postJson('/api/v1/auth/otp/send', ['phone' => '9829012345'])->assertOk();

        Http::assertSent(fn (Request $r) => $r['recipients'][0]['mobiles'] === '919829012345' && strlen($r['recipients'][0]['otp']) === 6);
    }
}
