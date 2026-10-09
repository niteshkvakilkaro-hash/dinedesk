<?php

namespace App\Modules\Plans\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Plans\Models\Plan;
use Illuminate\Http\JsonResponse;

class PlanController extends Controller
{
    /** Public pricing table. Prices may be null until the platform owner sets them. */
    public function index(): JsonResponse
    {
        $plans = Plan::where('is_active', true)->orderBy('sort_order')->get()->map(fn (Plan $p) => [
            'code' => $p->code,
            'name' => $p->name,
            'description' => $p->description,
            'price_monthly' => $p->price_monthly,
            'price_yearly' => $p->price_yearly,
            'features' => $p->features,
            'limits' => $p->limits,
        ]);

        return $this->ok($plans, null, ['trial' => config('dinedesk.trial')]);
    }
}
