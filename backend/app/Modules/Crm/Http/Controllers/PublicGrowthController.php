<?php

namespace App\Modules\Crm\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Crm\Models\Feedback;
use App\Modules\Crm\Services\FeedbackService;
use App\Modules\Loyalty\Services\Loyalty;
use App\Modules\Marketing\Services\Campaigns;
use App\Modules\Marketing\Services\Coupons;
use App\Modules\Ordering\Models\Order;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Guests on a business website: feedback, loyalty code, offers, unsubscribe. */
class PublicGrowthController extends Controller
{
    public function __construct(private readonly TenantContext $context) {}

    /** Whether this order can still be rated (and the rating if it was). */
    public function feedbackStatus(Request $request, string $publicId): JsonResponse
    {
        $order = $this->order($publicId, (string) $request->query('t'));
        $f = Feedback::where('order_id', $order->id)->first();

        return $this->ok(['can_rate' => $order->status === 'completed' && ! $f, 'rating' => $f?->rating]);
    }

    public function submitFeedback(Request $request, string $publicId, FeedbackService $service): JsonResponse
    {
        $data = $request->validate([
            't' => ['required', 'string'],
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'food' => ['nullable', 'integer', 'min:1', 'max:5'],
            'service' => ['nullable', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:600'],
            'consent_public' => ['boolean'],
        ]);
        $service->submit($this->order($publicId, $data['t']), $data);

        return $this->created(['rating' => (int) $data['rating']], 'Thank you for your feedback!');
    }

    public function loyaltyCode(Request $request, Loyalty $loyalty, FeatureService $features): JsonResponse
    {
        $tenant = $this->context->require();
        if (! $features->enabled($tenant, 'loyalty') || ! $loyalty->get()['enabled']) {
            throw new ApiException('Loyalty points are not available.', 422, 'loyalty_off');
        }
        $phone = Phone::normalize((string) $request->validate(['phone' => ['required', 'string', 'max:20']])['phone']);
        if (! preg_match('/^\+91[6-9]\d{9}$/', (string) $phone)) {
            throw new ApiException(Phone::MESSAGE, 422, 'invalid_phone', ['field' => 'phone']);
        }

        return $this->ok($loyalty->sendCode($tenant, $phone), 'Code sent.');
    }

    public function loyaltyVerify(Request $request, Loyalty $loyalty): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:20'], 'code' => ['required', 'digits:6']]);

        return $this->ok($loyalty->verify($this->context->require(), (string) Phone::normalize($data['phone']), $data['code']));
    }

    public function offers(Coupons $coupons, FeatureService $features): JsonResponse
    {
        return $this->ok($features->enabled($this->context->require(), 'coupons') ? $coupons->publicList() : []);
    }

    public function unsubscribe(Request $request, Campaigns $campaigns): JsonResponse
    {
        $token = (string) $request->validate(['t' => ['required', 'string', 'max:60']])['t'];
        if (! $campaigns->unsubscribe($token)) {
            throw new ApiException('This link is not valid any more.', 404, 'not_found');
        }

        return $this->ok(null, 'You will not get offers from us any more.');
    }

    private function order(string $publicId, string $token): Order
    {
        $order = Order::where('public_id', $publicId)->first();
        if (! $order || $token === '' || ! hash_equals($order->tracking_token, $token)) {
            throw new ApiException('Order not found.', 404, 'not_found');
        }

        return $order;
    }
}
