<?php

namespace Tests\Feature\Ordering;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Notify\Models\PushDevice;
use App\Modules\Notify\Support\FcmChannel;
use App\Modules\Notify\Support\SendFcm;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Notifications\NewOrderForStaff;
use App\Modules\Subscriptions\Models\PlatformSetting;
use App\Support\PlatformConfig;
use App\Support\Push\Fcm;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Notifications in the DineDesk Android app (Firebase Cloud Messaging): phones registered after
 * sign-in, the HTTP v1 sender, and the "fcm" channel next to web push.
 */
class AppPushTest extends OrderingTestCase
{
    private const SEND = 'https://fcm.googleapis.com/v1/projects/dinedesk-test/messages:send';

    private static ?array $key = null;

    private string $tokenA;

    private string $tokenB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tokenA = 'dA1b2C3d4E5f6:APA91b'.str_repeat('Ab_-', 30);
        $this->tokenB = 'eZ9y8X7w6V5u4:APA91b'.str_repeat('Cd-_', 30);
    }

    /** A real RSA key pair, made once (Windows PHP may need the openssl.cnf it ships with). */
    private static function rsa(): array
    {
        if (self::$key) {
            return self::$key;
        }
        foreach ([null, getenv('OPENSSL_CONF') ?: null, dirname(PHP_BINARY).'/extras/ssl/openssl.cnf', dirname(PHP_BINARY).'/../extras/ssl/openssl.cnf'] as $i => $config) {
            if ($i > 0 && (! $config || ! is_file($config))) {
                continue;
            }
            $opts = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA] + ($config ? ['config' => $config] : []);
            $k = @openssl_pkey_new($opts);
            if ($k && openssl_pkey_export($k, $pem, null, $config ? ['config' => $config] : [])) {
                return self::$key = ['private' => $pem, 'public' => openssl_pkey_get_details($k)['key']];
            }
        }
        throw new RuntimeException('Could not make an RSA key for the test.');
    }

    private function serviceAccount(): string
    {
        return json_encode([
            'type' => 'service_account',
            'project_id' => 'dinedesk-test',
            'private_key_id' => 'abc123',
            'private_key' => self::rsa()['private'],
            'client_email' => 'firebase-adminsdk@dinedesk-test.iam.gserviceaccount.com',
            'token_uri' => 'https://oauth2.googleapis.com/token',
        ]);
    }

    private function firebaseOn(): void
    {
        config(['dinedesk.firebase.credentials' => $this->serviceAccount()]);
    }

    private function fakeGoogle(array $send = []): void
    {
        Http::fake([
            Fcm::TOKEN_URL => Http::response(['access_token' => 'ya29.test-access', 'expires_in' => 3599, 'token_type' => 'Bearer']),
            'fcm.googleapis.com/*' => $send ? Http::sequence($send) : Http::response(['name' => 'projects/dinedesk-test/messages/1']),
        ]);
    }

    private function device(User $user, string $token): PushDevice
    {
        return PushDevice::create(['user_id' => $user->id, 'tenant_id' => $user->tenant_id, 'token' => $token, 'platform' => 'android']);
    }

    public function test_a_phone_is_registered_moves_to_whoever_signs_in_and_only_its_owner_removes_it(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $this->actingAsUser($owner)->postJson('/api/v1/devices', ['token' => 'short'])->assertUnprocessable();
        $this->postJson('/api/v1/devices', ['token' => $this->tokenA, 'app_version' => '1.3', 'flavor' => 'dev'])->assertOk()->assertJsonPath('data.devices', 1);
        $this->postJson('/api/v1/devices', ['token' => $this->tokenA, 'app_version' => '1.3', 'flavor' => 'dev'])->assertOk()->assertJsonPath('data.devices', 1);
        $d = PushDevice::sole();
        $this->assertSame([$owner->id, $this->tenant->id, 'android', 'dev', '1.3', 'en'], [$d->user_id, $d->tenant_id, $d->platform, $d->app_flavor, $d->app_version, $d->locale]);
        $this->assertNotNull($d->last_seen_at);

        // Someone else signs in on the same phone: it becomes theirs.
        $cashier = $this->staff($this->tenant, 'cashier');
        $this->actingAsUser($cashier)->postJson('/api/v1/devices', ['token' => $this->tokenA])->assertOk();
        $this->assertSame([$cashier->id], PushDevice::pluck('user_id')->all());

        // The previous owner can't remove it any more; its user can.
        $this->actingAsUser($owner)->deleteJson("/api/v1/devices/{$this->tokenA}")->assertOk();
        $this->assertSame(1, PushDevice::count());
        $this->actingAsUser($cashier)->deleteJson("/api/v1/devices/{$this->tokenA}")->assertOk();
        $this->assertSame(0, PushDevice::count());

        // A super admin (no business) has devices too.
        $admin = $this->user(['is_platform_admin' => true]);
        $this->actingAsUser($admin)->postJson('/api/v1/devices', ['token' => $this->tokenB])->assertOk();
        $this->assertNull(PushDevice::sole()->tenant_id);
    }

    public function test_never_from_a_support_session(): void
    {
        $admin = $this->user(['is_platform_admin' => true]);
        $token = $this->actingAsUser($admin)->postJson("/api/v1/platform/tenants/{$this->tenant->public_id}/support", ['reason' => 'Checking the menu for the owner', 'read_only' => false])->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/devices', ['token' => $this->tokenA], ['Authorization' => "Bearer {$token}"])->assertForbidden();
        $this->assertSame(0, PushDevice::count());
    }

    public function test_signing_out_removes_the_phone(): void
    {
        $owner = $this->ownerOf($this->tenant);
        $plain = $owner->createToken('web')->plainTextToken;
        $other = $this->device($owner, $this->tokenB); // signed in elsewhere, registered with another token
        $this->postJson('/api/v1/devices', ['token' => $this->tokenA], ['Authorization' => "Bearer {$plain}"])->assertOk();
        $this->assertNotNull(PushDevice::where('token', $this->tokenA)->value('access_token_id'));

        $this->postJson('/api/v1/auth/logout', [], ['Authorization' => "Bearer {$plain}"])->assertOk();
        $this->assertSame([$other->id], PushDevice::pluck('id')->all());
    }

    public function test_the_sender_signs_a_jwt_caches_the_access_token_and_sends_the_v1_message(): void
    {
        $this->firebaseOn();
        $this->fakeGoogle();
        $owner = $this->ownerOf($this->tenant);
        $this->device($owner, $this->tokenA);
        $this->device($owner, $this->tokenB);

        $result = app()->call([new SendFcm($owner->id, ['title' => 'New order #12 · ₹250', 'body' => 'Asha', 'url' => '/dashboard/orders', 'kind' => 'order', 'tag' => 'order-12'], 'orders'), 'handle']);
        $this->assertSame(['sent' => 2, 'removed' => 0, 'failed' => 0], $result);
        app()->call([new SendFcm($owner->id, ['title' => 'Again', 'body' => 'x'], 'nope'), 'handle']);

        // One access token for all four messages (cached).
        $tokenCalls = Http::recorded(fn (HttpRequest $r) => $r->url() === Fcm::TOKEN_URL);
        $this->assertCount(1, $tokenCalls);
        [$request] = $tokenCalls->first();
        $this->assertSame('urn:ietf:params:oauth:grant-type:jwt-bearer', $request['grant_type']);
        [$h, $c, $s] = explode('.', $request['assertion']);
        $dec = fn (string $v) => base64_decode(strtr($v, '-_', '+/'));
        $this->assertSame(['alg' => 'RS256', 'typ' => 'JWT'], json_decode($dec($h), true));
        $claims = json_decode($dec($c), true);
        $this->assertSame('firebase-adminsdk@dinedesk-test.iam.gserviceaccount.com', $claims['iss']);
        $this->assertSame(Fcm::SCOPE, $claims['scope']);
        $this->assertSame(Fcm::TOKEN_URL, $claims['aud']);
        $this->assertSame(3600, $claims['exp'] - $claims['iat']);
        $this->assertSame(1, openssl_verify("{$h}.{$c}", $dec($s), self::rsa()['public'], OPENSSL_ALGO_SHA256));

        $sends = Http::recorded(fn (HttpRequest $r) => $r->url() === self::SEND);
        $this->assertCount(4, $sends);
        [$first] = $sends->first();
        $this->assertSame(['Bearer ya29.test-access'], $first->header('Authorization'));
        $m = $first['message'];
        $this->assertSame($this->tokenA, $m['token']);
        $this->assertSame(['title' => 'New order #12 · ₹250', 'body' => 'Asha'], $m['notification']);
        $this->assertSame(['url' => '/dashboard/orders', 'kind' => 'order', 'channel' => 'orders', 'title' => 'New order #12 · ₹250', 'body' => 'Asha'], $m['data']);
        $this->assertSame('high', $m['android']['priority']);
        $this->assertSame('orders', $m['android']['notification']['channel_id']);
        $this->assertSame('order-12', $m['android']['notification']['tag']);
        // An unknown channel falls back to "general".
        $this->assertSame('general', $sends->last()[0]['message']['android']['notification']['channel_id']);
    }

    public function test_tokens_firebase_no_longer_knows_are_deleted(): void
    {
        $this->firebaseOn();
        $this->fakeGoogle([
            Http::response(['error' => ['code' => 404, 'status' => 'NOT_FOUND', 'details' => [['@type' => 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode' => 'UNREGISTERED']]]], 404),
            Http::response(['error' => ['code' => 400, 'status' => 'INVALID_ARGUMENT', 'details' => [['errorCode' => 'INVALID_ARGUMENT']]]], 400),
            Http::response(['error' => ['code' => 503, 'status' => 'UNAVAILABLE']], 503),
        ]);
        $owner = $this->ownerOf($this->tenant);
        $this->device($owner, $this->tokenA);
        $this->device($owner, $this->tokenB);
        $kept = $this->device($owner, 'fK3:'.str_repeat('x', 40));

        $result = app()->call([new SendFcm($owner->id, ['title' => 'T', 'body' => 'B']), 'handle']);
        $this->assertSame(['sent' => 0, 'removed' => 2, 'failed' => 1], $result);
        $this->assertSame([$kept->id], PushDevice::pluck('id')->all());
    }

    public function test_nothing_happens_without_firebase(): void
    {
        Http::fake();
        config(['dinedesk.firebase.credentials' => null]);
        $owner = $this->ownerOf($this->tenant);
        $this->device($owner, $this->tokenA);
        $this->assertSame([], FcmChannel::for($owner));
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        Http::assertNothingSent();

        // Firebase on, but nobody has the app: no channel either.
        $this->firebaseOn();
        PushDevice::query()->delete();
        $this->assertSame([], FcmChannel::for($owner));
        $this->device($owner, $this->tokenA);
        $this->assertSame(['fcm'], FcmChannel::for($owner));
    }

    public function test_a_new_order_rings_the_app_of_each_staff_member_in_their_language(): void
    {
        $this->firebaseOn();
        $this->fakeGoogle();
        $owner = $this->ownerOf($this->tenant);
        $cashier = $this->staff($this->tenant, 'cashier', ['locale' => 'hi']);
        $housekeeping = $this->staff($this->tenant, 'housekeeping'); // can't see orders
        $this->device($cashier, $this->tokenA);
        $this->device($housekeeping, $this->tokenB);
        $this->assertContains('fcm', (new NewOrderForStaff(new Order))->via($cashier));

        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();

        $sends = Http::recorded(fn (HttpRequest $r) => $r->url() === self::SEND);
        $this->assertCount(1, $sends); // the owner has no app; housekeeping doesn't see orders
        $m = $sends->first()[0]['message'];
        $this->assertSame($this->tokenA, $m['token']);
        $this->assertMatchesRegularExpression('/^नया ऑर्डर #\S+ · ₹[\d.]+$/u', $m['notification']['title']);
        $this->assertSame('Asha Verma · टेकअवे', $m['notification']['body']);
        $this->assertSame(['/dashboard/orders', 'order', 'orders'], [$m['data']['url'], $m['data']['kind'], $m['android']['notification']['channel_id']]);
        $this->assertNotContains($owner->id, PushDevice::pluck('user_id')->all());
    }

    public function test_the_dashboard_test_alert_also_goes_to_the_app(): void
    {
        $this->firebaseOn();
        $this->fakeGoogle();
        $owner = $this->ownerOf($this->tenant);
        $this->device($owner, $this->tokenA);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/push/test')->assertOk();
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::SEND && $r['message']['notification']['body'] === 'Test alert: push notifications work on this device.');
    }

    public function test_super_admin_saves_the_key_which_is_never_returned_and_tests_it(): void
    {
        $admin = $this->user(['is_platform_admin' => true]);
        $url = '/api/v1/platform/integrations';
        $json = $this->serviceAccount();
        $privateLine = explode("\n", self::rsa()['private'])[1];

        $this->actingAsUser($admin)->putJson("{$url}/firebase", ['values' => ['credentials' => $json]])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->putJson("{$url}/firebase", ['values' => ['credentials' => '{"project_id":"x"}'], 'current_password' => 'Password123'])->assertUnprocessable()->assertJsonValidationErrors('values.credentials');

        $res = $this->putJson("{$url}/firebase", ['values' => ['credentials' => $json], 'current_password' => 'Password123'])->assertOk()
            ->assertJsonPath('data.ready.firebase', true)
            ->assertJsonPath('data.firebase', ['project_id' => 'dinedesk-test', 'client_email' => 'firebase-adminsdk@dinedesk-test.iam.gserviceaccount.com'])
            ->assertJsonPath('data.integrations.firebase.credentials', fn ($f) => $f['set'] === true && $f['last4'] === null && $f['source'] === 'saved' && ! isset($f['value']));
        $this->assertStringNotContainsString($privateLine, $res->getContent());
        $this->assertStringNotContainsString($privateLine, $this->getJson($url)->getContent());
        $stored = PlatformSetting::where('key', PlatformConfig::SETTING)->value('value');
        $this->assertStringNotContainsString($privateLine, json_encode($stored));
        $this->assertTrue(Fcm::configured());
        $this->assertSame(['integration' => 'firebase', 'changed' => ['credentials'], 'removed' => []], AuditLog::where('action', 'platform.integrations.updated')->latest('id')->first()->meta);

        // Test: the key signs in; no phone signed in as the admin yet.
        $this->fakeGoogle();
        $this->postJson("{$url}/firebase/test")->assertOk()->assertJsonPath('data.ok', true)->assertJsonPath('data.message', fn ($m) => str_contains($m, 'no app devices are signed in as you'));
        Http::assertNotSent(fn (HttpRequest $r) => $r->url() === self::SEND);
        $this->device($admin, $this->tokenA);
        $this->postJson("{$url}/firebase/test")->assertOk()->assertJsonPath('data.ok', true)->assertJsonPath('data.message', fn ($m) => str_starts_with($m, 'Sent to 1 app device'));
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::SEND && $r['message']['token'] === $this->tokenA);

        // Removing it needs the password too; the server's FIREBASE_CREDENTIALS (none here) is used again.
        $this->putJson("{$url}/firebase", ['values' => [], 'remove' => ['credentials']])->assertUnprocessable();
        $this->putJson("{$url}/firebase", ['values' => [], 'remove' => ['credentials'], 'current_password' => 'Password123'])->assertOk()->assertJsonPath('data.ready.firebase', false)->assertJsonPath('data.firebase', null);
    }

    public function test_a_key_file_path_works_as_the_server_fallback(): void
    {
        $path = storage_path('framework/testing-firebase.json');
        @mkdir(dirname($path), 0777, true);
        file_put_contents($path, $this->serviceAccount());
        try {
            config(['dinedesk.firebase.credentials' => $path]);
            $this->assertSame('dinedesk-test', Fcm::summary()['project_id']);
            config(['dinedesk.firebase.credentials' => 'storage/framework/missing.json']);
            $this->assertFalse(Fcm::configured());
        } finally {
            @unlink($path);
        }
    }
}
