<?php

namespace App\Modules\Ordering\Services;

use App\Support\ApiException;
use Illuminate\Support\Facades\Http;

/**
 * Thin Razorpay client for one business's account.
 *
 * - Orders are created server-side with the amount we calculated (the browser
 *   can't change it).
 * - Checkout success is accepted only with a valid signature:
 *   HMAC-SHA256(order_id|payment_id, key_secret).
 * - Webhooks are accepted only with a valid X-Razorpay-Signature:
 *   HMAC-SHA256(raw body, webhook_secret).
 * Card / UPI details never reach us.
 */
class Razorpay
{
    public const API = 'https://api.razorpay.com/v1';

    public function __construct(private readonly OrderingSettings $settings) {}

    /** @return array{id: string, amount: int, currency: string} */
    public function createOrder(int $amountPaise, string $receipt, array $notes = []): array
    {
        $creds = $this->settings->razorpay();
        if (! $creds['key_id'] || ! $creds['key_secret']) {
            throw new ApiException('Online payment is not set up for this restaurant.', 422, 'payments_unavailable');
        }

        $response = Http::withBasicAuth($creds['key_id'], $creds['key_secret'])
            ->acceptJson()
            ->timeout(15)
            ->post(self::API.'/orders', [
                'amount' => $amountPaise,
                'currency' => 'INR',
                'receipt' => $receipt,
                'notes' => $notes,
            ]);

        if (! $response->successful() || ! $response->json('id')) {
            report(new \RuntimeException('Razorpay order failed: '.$response->status().' '.$response->body()));
            throw new ApiException('We could not start the payment. Please try again or choose another payment method.', 502, 'payment_gateway_error');
        }

        return ['id' => $response->json('id'), 'amount' => (int) $response->json('amount'), 'currency' => $response->json('currency')];
    }

    public function keyId(): ?string
    {
        return $this->settings->razorpay()['key_id'];
    }

    public function checkoutSignatureValid(string $orderId, string $paymentId, string $signature): bool
    {
        $secret = $this->settings->razorpay()['key_secret'];

        return $secret !== null && hash_equals(hash_hmac('sha256', $orderId.'|'.$paymentId, $secret), $signature);
    }

    public function webhookSignatureValid(string $rawBody, ?string $signature): bool
    {
        $secret = $this->settings->razorpay()['webhook_secret'];

        return $secret !== null && $signature !== null && hash_equals(hash_hmac('sha256', $rawBody, $secret), $signature);
    }
}
