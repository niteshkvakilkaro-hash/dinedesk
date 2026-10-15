<?php

namespace Tests\Feature\Platform;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Subscriptions\Models\PlatformSetting;
use App\Support\Ai\Ai;
use App\Support\Ai\ClaudeAi;
use App\Support\ApiException;
use App\Support\Messaging\LiveMessenger;
use App\Support\Messaging\Messenger;
use App\Support\PlatformConfig;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Super admin → Integrations: keys saved in the panel (encrypted), .env as the fallback. */
class IntegrationsTest extends TestCase
{
    private const URL = '/api/v1/platform/integrations';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->user(['is_platform_admin' => true]);
        config(['dinedesk.ai.api_key' => null, 'dinedesk.platform_razorpay' => ['key_id' => null, 'key_secret' => null, 'webhook_secret' => null]]);
    }

    private function save(string $integration, array $values, array $extra = [])
    {
        return $this->actingAsUser($this->admin)->putJson(self::URL."/{$integration}", ['values' => $values] + $extra);
    }

    public function test_only_platform_admins_outside_support_sessions(): void
    {
        $tenant = $this->business('Alpha Cafe');
        $this->actingAsUser($this->ownerOf($tenant))->getJson(self::URL)->assertForbidden();
        $this->actingAsUser($this->user())->putJson(self::URL.'/ai', ['values' => ['model' => 'x']])->assertForbidden();

        $token = $this->actingAsUser($this->admin)->postJson("/api/v1/platform/tenants/{$tenant->public_id}/support", ['reason' => 'Checking the menu for the owner', 'read_only' => false])->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->getJson(self::URL, ['Authorization' => "Bearer {$token}"])->assertForbidden();
        $this->putJson(self::URL.'/ai', ['values' => ['model' => 'x']], ['Authorization' => "Bearer {$token}"])->assertForbidden();
    }

    public function test_secrets_are_encrypted_never_returned_and_need_the_password(): void
    {
        $key = 'sk-ant-test-0123456789abcdWXYZ';
        $this->save('ai', ['api_key' => $key])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->save('ai', ['api_key' => $key], ['current_password' => 'wrong-password'])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        // A plain field alone needs no password.
        $this->save('ai', ['model' => 'claude-test-model'])->assertOk();

        $res = $this->save('ai', ['api_key' => $key], ['current_password' => 'Password123'])->assertOk();
        $this->assertStringNotContainsString($key, $res->getContent());
        $res->assertJsonPath('data.integrations.ai.api_key', fn ($f) => $f['set'] === true && $f['last4'] === 'WXYZ' && $f['source'] === 'saved' && ! isset($f['value']))
            ->assertJsonPath('data.integrations.ai.model.value', 'claude-test-model')
            ->assertJsonPath('data.ready.ai', true);
        $this->assertStringNotContainsString($key, $this->getJson(self::URL)->getContent());

        // Stored encrypted.
        $stored = PlatformSetting::where('key', PlatformConfig::SETTING)->value('value');
        $this->assertNotSame($key, $stored['ai.api_key']['v']);
        $this->assertStringNotContainsString($key, json_encode($stored));
        $this->assertSame('claude-test-model', $stored['ai.model']['v']);

        // Applied to config: the AI is on, with the saved model.
        $this->assertTrue(app(Ai::class)->enabled());
        $this->assertSame($key, config('dinedesk.ai.api_key'));
        $this->assertSame('claude-test-model', config('dinedesk.ai.model'));

        // Audited by field name, never by value.
        $logs = AuditLog::where('action', 'platform.integrations.updated')->get();
        $this->assertCount(2, $logs);
        $this->assertSame(['integration' => 'ai', 'changed' => ['api_key'], 'removed' => []], $logs->last()->meta);
        $this->assertStringNotContainsString($key, json_encode($logs->pluck('meta')));
    }

    public function test_empty_secret_keeps_the_old_one_remove_clears_and_env_is_the_fallback(): void
    {
        config(['dinedesk.platform_razorpay.key_id' => 'rzp_test_FROMENV', 'dinedesk.platform_razorpay.key_secret' => 'env-secret-0000111122223333']);
        $this->actingAsUser($this->admin)->getJson(self::URL)->assertOk()
            ->assertJsonPath('data.integrations.razorpay.key_id.source', 'env')
            ->assertJsonPath('data.integrations.razorpay.key_id.value', 'rzp_test_FROMENV')
            ->assertJsonPath('data.integrations.razorpay.key_secret.source', 'env')
            ->assertJsonPath('data.integrations.razorpay.webhook_secret.source', 'unset')
            ->assertJsonPath('data.integrations.razorpay.webhook_secret.set', false)
            ->assertJsonPath('data.webhook_events.0', 'subscription.authenticated');

        // The panel overrides .env.
        $this->save('razorpay', ['key_id' => 'rzp_live_PANEL', 'key_secret' => 'panel-secret-aaaabbbbccccdddd'], ['current_password' => 'Password123'])->assertOk()
            ->assertJsonPath('data.integrations.razorpay.key_id.source', 'saved')
            ->assertJsonPath('data.integrations.razorpay.key_secret.last4', 'dddd');
        $this->assertSame('rzp_live_PANEL', config('dinedesk.platform_razorpay.key_id'));
        $this->assertSame('panel-secret-aaaabbbbccccdddd', config('dinedesk.platform_razorpay.key_secret'));

        // Empty secret: kept (and no password needed).
        $this->save('razorpay', ['key_id' => 'rzp_live_PANEL', 'key_secret' => ''])->assertOk()->assertJsonPath('data.integrations.razorpay.key_secret.last4', 'dddd');
        $this->assertSame('panel-secret-aaaabbbbccccdddd', config('dinedesk.platform_razorpay.key_secret'));

        // Remove: needs the password, then .env is used again.
        $this->save('razorpay', [], ['remove' => ['key_secret']])->assertUnprocessable();
        $this->save('razorpay', ['key_id' => ''], ['remove' => ['key_secret'], 'current_password' => 'Password123'])->assertOk()
            ->assertJsonPath('data.integrations.razorpay.key_secret.source', 'env')
            ->assertJsonPath('data.integrations.razorpay.key_id.source', 'env');
        $this->assertSame('env-secret-0000111122223333', config('dinedesk.platform_razorpay.key_secret'));
        $this->assertSame('rzp_test_FROMENV', config('dinedesk.platform_razorpay.key_id'));
        $this->assertSame(['integration' => 'razorpay', 'changed' => [], 'removed' => ['key_id', 'key_secret']], AuditLog::where('action', 'platform.integrations.updated')->latest('id')->first()->meta);

        // A fresh process (new request, queued job) reads them again from the database.
        $this->save('razorpay', ['key_id' => 'rzp_live_AGAIN'])->assertOk();
        config(['dinedesk.platform_razorpay.key_id' => 'rzp_test_FROMENV']);
        $fresh = new PlatformConfig;
        $fresh->apply();
        $this->assertSame('rzp_live_AGAIN', config('dinedesk.platform_razorpay.key_id'));
        $this->assertSame('rzp_test_FROMENV', $fresh->serverValue('razorpay', 'key_id'));
    }

    public function test_validation_and_mail_settings_apply(): void
    {
        $this->save('razorpay', ['key_id' => 'not-a-key'])->assertUnprocessable()->assertJsonValidationErrors('values.key_id');
        $this->save('messaging', ['driver' => 'carrier-pigeon'])->assertUnprocessable();
        $this->actingAsUser($this->admin)->putJson(self::URL.'/webpush', ['values' => ['public_key' => 'x']])->assertNotFound();

        $this->save('mail', ['host' => 'smtp.example.com', 'port' => '465', 'encryption' => 'ssl', 'from_address' => 'billing@example.com', 'from_name' => '<b>DineDesk</b>'])->assertOk()
            ->assertJsonPath('data.ready.mail', true)->assertJsonPath('data.integrations.mail.encryption.value', 'ssl');
        $this->assertSame('smtp', config('mail.default'));
        $this->assertSame(465, config('mail.mailers.smtp.port'));
        $this->assertSame('smtps', config('mail.mailers.smtp.scheme'));
        $this->assertSame('DineDesk', config('mail.from.name'));

        // Clearing the host: back to the server's mailer.
        $this->save('mail', ['host' => ''])->assertOk();
        $this->assertSame('array', config('mail.default'));

        $this->save('messaging', ['driver' => 'live'])->assertOk();
        $this->assertInstanceOf(LiveMessenger::class, app(Messenger::class));
    }

    public function test_razorpay_test_calls_the_api_and_reports_errors(): void
    {
        $this->actingAsUser($this->admin)->postJson(self::URL.'/razorpay/test')->assertOk()->assertJsonPath('data.ok', false);

        $this->save('razorpay', ['key_id' => 'rzp_test_ABC', 'key_secret' => 'secret-key-abcdefghijkl'], ['current_password' => 'Password123'])->assertOk();
        Http::fake(['api.razorpay.com/*' => Http::sequence()
            ->push(['entity' => 'collection', 'count' => 0, 'items' => []])
            ->push(['error' => ['code' => 'BAD_REQUEST_ERROR', 'description' => 'Authentication failed']], 401)]);
        $this->postJson(self::URL.'/razorpay/test')->assertOk()->assertJsonPath('data.ok', true)->assertJsonPath('data.message', 'Connected to Razorpay (test keys).');
        Http::assertSent(fn (HttpRequest $r) => $r->url() === 'https://api.razorpay.com/v1/plans?count=1'
            && $r->hasHeader('Authorization', 'Basic '.base64_encode('rzp_test_ABC:secret-key-abcdefghijkl')));
        $this->postJson(self::URL.'/razorpay/test')->assertOk()->assertJsonPath('data.ok', false)->assertJsonPath('data.message', 'Razorpay said: Authentication failed');

        $this->assertSame([true, false], AuditLog::where('action', 'platform.integrations.tested')->where('meta->integration', 'razorpay')->orderBy('id')->get()->pluck('meta.ok')->slice(1)->values()->all());
    }

    public function test_whatsapp_and_sms_tests_follow_the_messaging_mode(): void
    {
        $this->actingAsUser($this->admin)->postJson(self::URL.'/whatsapp/test', ['phone' => '12345'])->assertOk()->assertJsonPath('data.ok', false);
        Http::fake(['graph.facebook.com/*' => Http::sequence()->push(['messages' => [['id' => 'wamid.1']]])->push(['error' => ['message' => 'Invalid OAuth access token']], 401)]);
        // Log only: nothing leaves the server.
        $this->postJson(self::URL.'/sms/test', ['phone' => '9829012345'])->assertOk()->assertJsonPath('data.ok', true)->assertJsonPath('data.message', fn ($m) => str_contains($m, 'Log only'));
        Http::assertNothingSent();

        $this->save('messaging', ['driver' => 'live'])->assertOk();
        $this->postJson(self::URL.'/whatsapp/test', ['phone' => '9829012345'])->assertJsonPath('data.ok', false)->assertJsonPath('data.message', 'Enter the access token, phone number ID and template first.');
        $this->save('whatsapp', ['token' => 'EAAG-test-token-123456', 'phone_number_id' => '1234567890', 'template' => 'dinedesk_update', 'language' => 'en'], ['current_password' => 'Password123'])->assertOk();
        $this->postJson(self::URL.'/whatsapp/test', ['phone' => '9829012345'])->assertJsonPath('data.ok', true)->assertJsonPath('data.message', 'Sent. Check the phone.');
        Http::assertSent(fn (HttpRequest $r) => str_contains($r->url(), '/1234567890/messages') && $r['to'] === '919829012345' && $r['template']['name'] === 'dinedesk_update');
        $this->postJson(self::URL.'/whatsapp/test', ['phone' => '9829012345'])->assertJsonPath('data.ok', false)->assertJsonPath('data.message', fn ($m) => str_contains($m, 'Invalid OAuth access token'));
    }

    public function test_mail_test_sends_an_email(): void
    {
        $this->actingAsUser($this->admin)->postJson(self::URL.'/mail/test', ['email' => 'nope'])->assertUnprocessable();
        $this->postJson(self::URL.'/mail/test', ['email' => 'me@example.com'])->assertOk()->assertJsonPath('data.ok', true);
        $sent = app('mail.manager')->mailer('array')->getSymfonyTransport()->messages();
        $this->assertSame('me@example.com', $sent->last()->getEnvelope()->getRecipients()[0]->getAddress());
    }

    public function test_ai_test_uses_the_ai_class(): void
    {
        $this->actingAsUser($this->admin)->postJson(self::URL.'/ai/test')->assertOk()->assertJsonPath('data.ok', false)->assertJsonPath('data.message', 'Enter the API key first.');
        $this->assertInstanceOf(ClaudeAi::class, app(Ai::class));
        $this->app->instance(Ai::class, new class implements Ai
        {
            public int $calls = 0;

            public function enabled(): bool
            {
                return true;
            }

            public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array
            {
                $this->calls++;
                if ($this->calls > 1) {
                    throw new ApiException('The AI could not answer right now. Please try again in a minute.', 502, 'ai_failed');
                }

                return ['ok' => true];
            }
        });
        $this->postJson(self::URL.'/ai/test')->assertJsonPath('data.ok', true);
        $this->postJson(self::URL.'/ai/test')->assertJsonPath('data.ok', false)->assertJsonPath('data.message', 'The AI could not answer right now. Please try again in a minute.');
    }

    public function test_web_push_keys_are_generated_with_the_password(): void
    {
        $this->actingAsUser($this->admin)->postJson(self::URL.'/webpush/generate')->assertUnprocessable();
        $res = $this->postJson(self::URL.'/webpush/generate', ['current_password' => 'Password123'])->assertOk()
            ->assertJsonPath('data.ready.webpush', true)
            ->assertJsonPath('data.integrations.webpush.private_key.source', 'saved');
        $private = config('dinedesk.webpush.private_key');
        $this->assertNotEmpty($private);
        $this->assertStringNotContainsString($private, $res->getContent());
        $this->assertSame($res->json('data.integrations.webpush.public_key.value'), config('dinedesk.webpush.public_key'));
    }

    public function test_test_endpoints_are_rate_limited(): void
    {
        $this->actingAsUser($this->admin);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson(self::URL.'/razorpay/test')->assertOk();
        }
        $this->postJson(self::URL.'/razorpay/test')->assertStatus(429);
    }
}
