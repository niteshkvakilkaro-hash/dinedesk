<?php

namespace App\Modules\Subscriptions\Services;

use App\Support\ApiException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * The platform's own Razorpay account, for business subscriptions (Razorpay Subscriptions API).
 * Checkout success: HMAC-SHA256(payment_id|subscription_id, key_secret).
 * Webhooks: HMAC-SHA256(raw body, webhook_secret).
 */
class PlatformRazorpay
{
    public const API = 'https://api.razorpay.com/v1';

    public function configured(): bool
    {
        $c = config('dinedesk.platform_razorpay');

        return ! empty($c['key_id']) && ! empty($c['key_secret']);
    }

    public function keyId(): ?string
    {
        return config('dinedesk.platform_razorpay.key_id');
    }

    /** @return string Razorpay plan id */
    public function createPlan(string $period, int $amountPaise, string $name, string $description): string
    {
        $r = $this->call('post', '/plans', [
            'period' => $period === 'yearly' ? 'yearly' : 'monthly',
            'interval' => 1,
            'item' => ['name' => $name, 'amount' => $amountPaise, 'currency' => 'INR', 'description' => $description],
        ]);

        return (string) $r->json('id');
    }

    /** @return array{id: string, short_url: ?string, status: string} */
    public function createSubscription(string $planId, string $cycle, array $notes): array
    {
        $r = $this->call('post', '/subscriptions', [
            'plan_id' => $planId,
            // Billed until cancelled: 10 years of cycles.
            'total_count' => $cycle === 'yearly' ? 10 : 120,
            'customer_notify' => 1,
            'notes' => $notes,
        ]);

        return ['id' => (string) $r->json('id'), 'short_url' => $r->json('short_url'), 'status' => (string) $r->json('status')];
    }

    /** Switch plan now (upgrade) or at the end of the cycle (downgrade). */
    public function changePlan(string $subscriptionId, string $planId, bool $now): array
    {
        return $this->call('patch', "/subscriptions/{$subscriptionId}", [
            'plan_id' => $planId,
            'schedule_change_at' => $now ? 'now' : 'cycle_end',
            'customer_notify' => 1,
        ])->json();
    }

    public function cancel(string $subscriptionId, bool $atCycleEnd): array
    {
        return $this->call('post', "/subscriptions/{$subscriptionId}/cancel", ['cancel_at_cycle_end' => $atCycleEnd ? 1 : 0])->json();
    }

    public function checkoutSignatureValid(string $paymentId, string $subscriptionId, string $signature): bool
    {
        $secret = config('dinedesk.platform_razorpay.key_secret');

        return $secret && hash_equals(hash_hmac('sha256', $paymentId.'|'.$subscriptionId, $secret), $signature);
    }

    public function webhookSignatureValid(string $rawBody, ?string $signature): bool
    {
        $secret = config('dinedesk.platform_razorpay.webhook_secret');

        return $secret && $signature && hash_equals(hash_hmac('sha256', $rawBody, $secret), $signature);
    }

    private function call(string $method, string $path, array $body): Response
    {
        if (! $this->configured()) {
            throw new ApiException('Online subscription payments are not set up yet. Please contact support.', 422, 'billing_unavailable');
        }
        $c = config('dinedesk.platform_razorpay');
        $r = Http::withBasicAuth($c['key_id'], $c['key_secret'])->acceptJson()->timeout(20)->{$method}(self::API.$path, $body);
        if (! $r->successful() || ! $r->json('id')) {
            report(new \RuntimeException("Razorpay {$method} {$path} failed: ".$r->status().' '.$r->body()));
            throw new ApiException('The payment provider did not respond. Please try again in a minute.', 502, 'payment_gateway_error');
        }

        return $r;
    }
}
