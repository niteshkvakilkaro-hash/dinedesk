<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Support\Features;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Super admin: plan prices, included features and limits. */
class PlatformPlanController extends Controller
{
    public function index(): JsonResponse
    {
        return $this->ok(Plan::orderBy('sort_order')->get(), null, [
            'catalogue' => Features::CATALOGUE,
            'limit_keys' => array_keys(Features::LIMITS),
        ]);
    }

    public function update(Request $request, string $code): JsonResponse
    {
        $plan = Plan::where('code', $code)->firstOrFail();
        $limitRules = [];
        foreach (array_keys(Features::LIMITS) as $key) {
            $limitRules["limits.{$key}"] = ['nullable', 'integer', 'min:0', 'max:1000000'];
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'price_monthly' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999'],
            'price_yearly' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'features' => ['sometimes', 'array'],
            'features.*' => [Rule::in(Features::keys())],
            'limits' => ['sometimes', 'array'],
            'is_active' => ['sometimes', 'boolean'],
            ...$limitRules,
        ]);

        if (isset($data['limits'])) {
            $data['limits'] = array_intersect_key($data['limits'], Features::LIMITS) + ($plan->limits ?? []);
        }
        if (isset($data['features'])) {
            $data['features'] = array_values(array_unique($data['features']));
        }

        $before = $plan->only(array_keys($data));
        $plan->update($data);
        AuditLog::record('platform.plan.updated', $plan, ['before' => $before, 'after' => $data]);

        return $this->ok($plan->fresh(), 'Plan saved. Changes apply to every business on this plan.');
    }
}
