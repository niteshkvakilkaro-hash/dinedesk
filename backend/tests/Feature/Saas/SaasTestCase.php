<?php

namespace Tests\Feature\Saas;

use App\Models\User;
use App\Modules\Plans\Models\Plan;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Ordering\OrderingTestCase;

/**
 * A live business (Spice Route, Growth trial, menu with dishes) and a priced platform:
 * Starter ₹999 / ₹9,990, Growth ₹1,999 / ₹19,990, Pro ₹3,999 / ₹39,990 a month / year,
 * GST 18% (the platform has a Rajasthan GSTIN), platform Razorpay keys set.
 */
abstract class SaasTestCase extends OrderingTestCase
{
    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant->update(['status' => 'live', 'onboarding_step' => 8]);
        config(['dinedesk.platform_razorpay' => ['key_id' => 'rzp_test_PLATFORM', 'key_secret' => 'plat_secret', 'webhook_secret' => 'plat_whsec']]);
        foreach (['starter' => [999, 9990], 'growth' => [1999, 19990], 'pro' => [3999, 39990]] as $code => [$m, $y]) {
            Plan::where('code', $code)->update(['price_monthly' => $m, 'price_yearly' => $y]);
        }
        $this->admin = $this->user(['is_platform_admin' => true]);
        $this->actingAsUser($this->admin)->putJson('/api/v1/platform/settings', [
            'seller' => ['legal_name' => 'DineDesk Technologies', 'gstin' => '08ABCDE1234F1Z5', 'address' => 'Jaipur', 'invoice_prefix' => 'DD'],
            'billing' => ['grace_days' => 7, 'gst_rate' => 18, 'sac' => '998315'],
        ])->assertOk();
    }

    protected function owner(): User
    {
        return $this->ownerOf($this->tenant);
    }

    protected function webhook(string $event, array $payload): TestResponse
    {
        $body = json_encode(['event' => $event, 'payload' => $payload]);

        return $this->call('POST', '/api/v1/webhooks/razorpay-platform', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_X_RAZORPAY_SIGNATURE' => hash_hmac('sha256', $body, 'plat_whsec')], $body);
    }

    protected function subEntity(string $id, string $planId, int $start, int $end): array
    {
        return ['subscription' => ['entity' => ['id' => $id, 'plan_id' => $planId, 'current_start' => $start, 'current_end' => $end, 'status' => 'active']]];
    }
}
