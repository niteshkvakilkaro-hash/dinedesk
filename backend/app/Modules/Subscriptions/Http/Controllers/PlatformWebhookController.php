<?php

namespace App\Modules\Subscriptions\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Subscriptions\Services\PlatformRazorpay;
use App\Modules\Subscriptions\Services\SubscriptionManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/webhooks/razorpay-platform — the platform's Razorpay account (business
 * subscriptions). The raw body is verified with the platform webhook secret first.
 */
class PlatformWebhookController extends Controller
{
    public function __invoke(Request $request, PlatformRazorpay $razorpay, SubscriptionManager $subscriptions): JsonResponse
    {
        if (! $razorpay->webhookSignatureValid($request->getContent(), $request->header('X-Razorpay-Signature'))) {
            return response()->json(['ok' => false, 'error' => 'invalid signature'], 400);
        }
        $subscriptions->webhook((string) $request->input('event'), (array) $request->input('payload', []));

        return response()->json(['ok' => true]);
    }
}
