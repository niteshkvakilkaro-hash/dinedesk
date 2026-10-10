<?php

namespace App\Modules\Ordering\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Hotel\Services\RoomBookings;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\Razorpay;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/v1/webhooks/razorpay/{tenant public id}
 * Each business sets this URL (and a webhook secret) in its own Razorpay
 * dashboard. The raw body is verified with that secret before anything is read.
 * Events handled: payment.captured, order.paid, payment.failed. Repeats are harmless.
 */
class RazorpayWebhookController extends Controller
{
    public function __invoke(Request $request, string $tenant, TenantContext $context): JsonResponse
    {
        $tenantModel = Tenant::where('public_id', $tenant)->first();
        if (! $tenantModel) {
            return response()->json(['ok' => false], 404);
        }

        return $context->run($tenantModel, function () use ($request) {
            $razorpay = app(Razorpay::class);
            if (! $razorpay->webhookSignatureValid($request->getContent(), $request->header('X-Razorpay-Signature'))) {
                return response()->json(['ok' => false, 'error' => 'invalid signature'], 400);
            }

            $event = (string) $request->input('event');
            $entity = (array) $request->input('payload.payment.entity', []);
            $orderId = $entity['order_id'] ?? $request->input('payload.order.entity.id');
            $payment = $orderId ? Payment::where('provider_order_id', $orderId)->first() : null;
            if (! $payment) {
                return response()->json(['ok' => true, 'ignored' => 'unknown order']);
            }

            // Advance for a room booking (hotel module).
            if ($payment->room_booking_id) {
                $stays = app(RoomBookings::class);
                match ($event) {
                    'payment.captured', 'order.paid' => $stays->advancePaid($payment, (string) ($entity['id'] ?? $payment->provider_payment_id ?? 'webhook'), $entity['method'] ?? null),
                    'payment.failed' => $stays->advanceFailed($payment, $entity['error_description'] ?? null),
                    default => null,
                };

                return response()->json(['ok' => true]);
            }

            $flow = app(OrderFlow::class);
            match ($event) {
                'payment.captured', 'order.paid' => $flow->markPaid($payment, (string) ($entity['id'] ?? $payment->provider_payment_id ?? 'webhook'), $entity['method'] ?? null),
                'payment.failed' => $flow->markPaymentFailed($payment, $entity['error_description'] ?? null),
                default => null,
            };

            return response()->json(['ok' => true]);
        });
    }
}
