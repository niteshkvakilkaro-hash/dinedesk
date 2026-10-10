<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Subscriptions\Services\PlatformRazorpay;
use App\Modules\Subscriptions\Services\PlatformSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super admin → Settings: seller details for subscription invoices, GST, grace period. */
class PlatformSettingsController extends Controller
{
    public function show(PlatformSettings $settings, PlatformRazorpay $razorpay): JsonResponse
    {
        return $this->ok($settings->all() + [
            'razorpay_configured' => $razorpay->configured(),
            'webhook_url' => url('/api/v1/webhooks/razorpay-platform'),
            'domain_target' => config('dinedesk.domains.cname_target'),
        ]);
    }

    public function update(Request $request, PlatformSettings $settings, PlatformRazorpay $razorpay): JsonResponse
    {
        $data = $request->validate(PlatformSettings::rules(), ['seller.gstin.regex' => 'Enter a valid 15-character GSTIN.']);
        if (isset($data['seller']['gstin'])) {
            $data['seller']['gstin'] = strtoupper($data['seller']['gstin']);
        }
        $before = $settings->all();
        $saved = $settings->save($data);
        AuditLog::record('platform.settings.updated', null, ['before' => $before, 'after' => $saved], null);

        return $this->ok($saved + ['razorpay_configured' => $razorpay->configured(), 'webhook_url' => url('/api/v1/webhooks/razorpay-platform'), 'domain_target' => config('dinedesk.domains.cname_target')], 'Saved.');
    }
}
