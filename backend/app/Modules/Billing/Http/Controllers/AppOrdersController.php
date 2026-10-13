<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Services\AppOrders;
use App\Modules\Ordering\Services\Pricing;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** POS → a Swiggy / Zomato order: to the kitchen, billed and marked paid through the app. */
class AppOrdersController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly AppOrders $apps) {}

    public function store(Request $request): JsonResponse
    {
        if ($request->filled('customer.phone')) {
            $request->merge(['customer' => ['phone' => Phone::normalize($request->input('customer.phone'))] + $request->input('customer')]);
        }
        $data = $request->validate([
            'channel' => ['required', Rule::in(array_keys(AppOrders::APPS))],
            'channel_ref' => ['nullable', 'string', 'max:40'],
            'customer' => ['nullable', 'array'],
            'customer.name' => ['nullable', 'string', 'max:120'],
            'customer.phone' => ['nullable', Phone::RULE],
            'notes' => ['nullable', 'string', 'max:500'],
            ...Pricing::lineRules(),
        ], ['customer.phone.regex' => Phone::MESSAGE]);
        ['order' => $order, 'invoice' => $invoice] = $this->apps->place($this->context->require(), $data, $request->user());

        return $this->created([
            'id' => $order->id, 'number' => $order->number, 'bill' => $invoice->number, 'total' => $invoice->total, 'commission' => $order->commission,
        ], AppOrders::APPS[$data['channel']].' order sent to the kitchen and billed.');
    }
}
