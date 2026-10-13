<?php

namespace App\Modules\Billing\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Billing\Models\BillPayment;
use App\Modules\Billing\Services\OfflineSales;
use App\Modules\Ordering\Services\Pricing;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/** POS without internet: the pricing pack it keeps, and the sales it sends back once online. */
class OfflinePosController extends Controller
{
    public const MAX_BATCH = 50;

    public function __construct(private readonly TenantContext $context, private readonly OfflineSales $sales) {}

    public function pack(): JsonResponse
    {
        return $this->ok($this->sales->pack());
    }

    /** Sales are handled one by one: a bad one is reported and the rest still go through. */
    public function sync(Request $request): JsonResponse
    {
        $request->validate(['sales' => ['required', 'array', 'min:1', 'max:'.self::MAX_BATCH]]);
        $tenant = $this->context->require();
        $results = [];
        foreach ($request->input('sales') as $sale) {
            if (! empty($sale['customer']['phone'] ?? null)) {
                $sale['customer']['phone'] = Phone::normalize((string) $sale['customer']['phone']);
            }
            $v = Validator::make(is_array($sale) ? $sale : [], [
                'ref' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/'],
                'at' => ['required', 'date'],
                'total' => ['nullable', 'numeric', 'min:0'],
                'customer' => ['nullable', 'array'],
                'customer.name' => ['nullable', 'string', 'max:120'],
                'customer.phone' => ['nullable', Phone::RULE],
                'notes' => ['nullable', 'string', 'max:500'],
                'payments' => ['required', 'array', 'min:1', 'max:5'],
                'payments.*.mode' => ['required', Rule::in(array_values(array_diff(BillPayment::MODES, ['online', 'gift_card'])))],
                'payments.*.amount' => ['required', 'numeric', 'min:0', 'max:10000000'],
                'payments.*.reference' => ['nullable', 'string', 'max:80'],
                ...Pricing::lineRules(),
            ]);
            if ($v->fails()) {
                $results[] = ['ref' => (string) ($sale['ref'] ?? ''), 'status' => 'failed', 'message' => $v->errors()->first()];

                continue;
            }
            $results[] = $this->sales->sync($tenant, $v->validated(), $request->user());
        }

        return $this->ok(['results' => $results]);
    }
}
