<?php

namespace App\Modules\Ordering\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Models\Payment;
use App\Modules\Ordering\Services\DeliveryZones;
use App\Modules\Ordering\Services\OrderFlow;
use App\Modules\Ordering\Services\OrderPresenter;
use App\Modules\Ordering\Services\Pricing;
use App\Modules\Ordering\Services\Razorpay;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Customer side of ordering on a business website (tenant from host). */
class PublicOrderController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly OrderFlow $flow,
        private readonly OrderPresenter $presenter,
    ) {}

    /** Live price breakdown for the cart / checkout (nothing is saved). */
    public function quote(Request $request, Pricing $pricing, DeliveryZones $zones): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(Order::TYPES)],
            'pincode' => ['nullable', 'regex:/^[1-9]\d{5}$/'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'phone' => ['nullable', 'string', 'max:20'],
            ...self::offerRules(),
            ...Pricing::lineRules(),
        ], ['pincode.regex' => 'Enter a valid 6-digit pincode.']);

        $zone = null;
        $zoneError = null;
        if ($data['type'] === 'delivery' && (($data['pincode'] ?? null) || isset($data['lat']))) {
            try {
                $zone = $zones->resolve($data['pincode'] ?? null, $data['lat'] ?? null, $data['lng'] ?? null);
            } catch (ApiException $e) {
                $zoneError = ['message' => $e->getMessage(), 'code' => $e->errorCode];
            }
        }
        try {
            $quote = $pricing->quote($data['type'], $data['items'], $zone);
        } catch (ApiException $e) {
            if ($e->errorCode !== 'below_minimum') {
                throw $e;
            }
            // Still show the breakdown; checkout explains the minimum.
            $quote = $pricing->quote($data['type'], $data['items']);
            $zoneError = ['message' => $e->getMessage(), 'code' => $e->errorCode, 'min_order' => $e->meta['min_order']];
            $quote['zone'] = ['id' => $zone->id, 'name' => $zone->name, 'fee' => $zone->fee, 'min_order' => $zone->min_order, 'free_above' => $zone->free_above];
        }

        // Coupon / points: shown in the breakdown; a problem with them doesn't hide the price.
        $offerError = null;
        if (! empty($data['coupon_code']) || ! empty($data['loyalty']['token'])) {
            try {
                [$quote] = $this->flow->discounts($this->context->require(), $quote, $data, ! empty($data['phone']) ? Phone::normalize($data['phone']) : null);
            } catch (ApiException $e) {
                $offerError = ['message' => $e->getMessage(), 'code' => $e->errorCode, 'field' => $e->meta['field'] ?? null];
            }
        }

        return $this->ok($quote + ['zone_error' => $zoneError, 'offer_error' => $offerError]);
    }

    private static function offerRules(): array
    {
        return [
            'coupon_code' => ['nullable', 'string', 'max:30'],
            'loyalty' => ['nullable', 'array'],
            'loyalty.token' => ['nullable', 'string', 'max:1000'],
            'loyalty.points' => ['nullable', 'integer', 'min:0', 'max:10000000'],
        ];
    }

    public function store(Request $request): JsonResponse
    {
        if ($request->filled('customer.phone')) {
            $request->merge(['customer' => ['phone' => Phone::normalize($request->input('customer.phone'))] + $request->input('customer')]);
        }
        $data = $request->validate([
            'type' => ['required', Rule::in(Order::TYPES)],
            'payment_method' => ['required', Rule::in(Order::PAYMENT_METHODS)],
            'scheduled_for' => ['nullable', 'date'],
            // Room service: the stay's guest details are used (checked with the room PIN).
            'customer' => ['required_unless:type,room_service', 'nullable', 'array'],
            'customer.name' => ['required_unless:type,room_service', 'nullable', 'string', 'min:2', 'max:120'],
            // Diners ordering from a table QR may leave their number out.
            'customer.phone' => ['required_without_all:table_token,room_token', 'nullable', Phone::RULE],
            'customer.email' => ['nullable', 'email:rfc', 'max:160'],
            'address' => ['required_if:type,delivery', 'nullable', 'array'],
            'address.line1' => ['required_if:type,delivery', 'nullable', 'string', 'max:200'],
            'address.line2' => ['nullable', 'string', 'max:200'],
            'address.landmark' => ['nullable', 'string', 'max:120'],
            'address.pincode' => ['required_if:type,delivery', 'nullable', 'regex:/^[1-9]\d{5}$/'],
            'address.lat' => ['nullable', 'numeric', 'between:-90,90'],
            'address.lng' => ['nullable', 'numeric', 'between:-180,180'],
            'table_label' => ['nullable', 'string', 'max:40'],
            'table_token' => ['nullable', 'string', 'max:40'],
            'room_token' => ['required_if:type,room_service', 'nullable', 'string', 'max:40'],
            'room_pin' => ['required_if:type,room_service', 'nullable', 'digits:4'],
            'marketing_opt_in' => ['boolean'],
            ...self::offerRules(),
            'notes' => ['nullable', 'string', 'max:500'],
            ...Pricing::lineRules(),
        ], [
            'customer.phone.regex' => Phone::MESSAGE,
            'customer.phone.required_without_all' => 'Enter your mobile number.',
            'room_pin.required_if' => 'Enter the last 4 digits of the mobile number used for the room booking.',
            'room_pin.digits' => 'Enter the last 4 digits of the mobile number used for the room booking.',
            'address.pincode.regex' => 'Enter a valid 6-digit pincode.',
            'address.line1.required_if' => 'Enter your delivery address.',
            'address.pincode.required_if' => 'Enter your pincode.',
        ]);

        $result = $this->flow->place($this->context->require(), $data, (string) $request->header('X-Locale', 'en'));
        $order = $result['order']->load('events');

        return $this->created([
            'order' => $this->presenter->forCustomer($order),
            'token' => $order->tracking_token,
            'razorpay' => $result['razorpay'],
        ], 'Order placed.');
    }

    /** Tracking page data; needs the private token from the confirmation / message link. */
    public function show(Request $request, string $publicId): JsonResponse
    {
        return $this->ok($this->presenter->forCustomer($this->find($publicId, (string) $request->query('t'))));
    }

    /** The guest paid the restaurant's UPI ID and gives the reference (UTR) shown in their UPI app. */
    public function upiReference(Request $request, string $publicId): JsonResponse
    {
        $data = $request->validate([
            't' => ['required', 'string'],
            'reference' => ['required', 'string', 'regex:/^[A-Za-z0-9]{6,30}$/'],
        ], ['reference.regex' => 'Enter the UPI reference (UTR) from your UPI app: 6 to 30 letters or digits.']);
        $order = $this->flow->upiReference($this->find($publicId, $data['t']), $data['reference']);

        return $this->ok($this->presenter->forCustomer($order->fresh(['items', 'events'])), 'Thanks! The restaurant will confirm your payment.');
    }

    /** Razorpay Checkout success handler: accepted only with a valid signature. */
    public function verifyPayment(Request $request, string $publicId, Razorpay $razorpay): JsonResponse
    {
        $data = $request->validate([
            't' => ['required', 'string'],
            'razorpay_order_id' => ['required', 'string', 'max:64'],
            'razorpay_payment_id' => ['required', 'string', 'max:64'],
            'razorpay_signature' => ['required', 'string', 'max:128'],
        ]);
        $order = $this->find($publicId, $data['t']);
        $payment = Payment::where('order_id', $order->id)->where('provider_order_id', $data['razorpay_order_id'])->first();

        if (! $payment || ! $razorpay->checkoutSignatureValid($data['razorpay_order_id'], $data['razorpay_payment_id'], $data['razorpay_signature'])) {
            throw new ApiException('We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded by your bank.', 422, 'payment_unverified');
        }
        $this->flow->markPaid($payment, $data['razorpay_payment_id']);

        return $this->ok($this->presenter->forCustomer($order->fresh(['items', 'events'])), 'Payment received.');
    }

    private function find(string $publicId, string $token): Order
    {
        $order = Order::with(['items', 'events'])->where('public_id', $publicId)->first();
        if (! $order || $token === '' || ! hash_equals($order->tracking_token, $token)) {
            throw new ApiException('Order not found.', 404, 'not_found');
        }

        return $order;
    }
}
