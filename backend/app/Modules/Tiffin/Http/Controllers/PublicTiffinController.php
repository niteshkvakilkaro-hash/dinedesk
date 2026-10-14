<?php

namespace App\Modules\Tiffin\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tiffin\Models\MealPlan;
use App\Modules\Tiffin\Services\Tiffin;
use App\Support\Locale;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Guests on the website: the tiffin plans on offer, and asking to join one. */
class PublicTiffinController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly Tiffin $tiffin) {}

    public function plans(): JsonResponse
    {
        return $this->ok(MealPlan::where('is_active', true)->orderBy('sort')->orderBy('id')->get()
            ->map(fn (MealPlan $p) => $p->only(['id', 'name', 'description', 'diet', 'slot', 'meals', 'days_valid', 'price']))->values());
    }

    public function request(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $today = $this->tiffin->today($tenant);
        $d = $request->validate([
            'meal_plan_id' => ['required', 'integer', Rule::exists('meal_plans', 'id')->where('tenant_id', $tenant->id)->where('is_active', true)],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'address' => ['required', 'string', 'min:5', 'max:300'],
            'slot' => ['nullable', Rule::in(MealPlan::SLOTS)],
            'starts_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.$today->format('Y-m-d'), 'before_or_equal:'.$today->addDays(30)->format('Y-m-d')],
            'notes' => ['nullable', 'string', 'max:300'],
        ], ['phone.regex' => Phone::MESSAGE]);
        $sub = $this->tiffin->request($tenant, MealPlan::findOrFail($d['meal_plan_id']), $d + ['locale' => Locale::guest($request->header('X-Locale'))]);

        return $this->created(['code' => $sub->code(), 'plan' => $sub->plan?->name, 'starts_on' => $sub->starts_on->format('Y-m-d')], 'Request received. We will call you to confirm.');
    }
}
