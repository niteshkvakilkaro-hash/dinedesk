<?php

namespace App\Modules\Onboarding\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Identity\Support\SessionPayload;
use App\Modules\Onboarding\Actions\CreateBusiness;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OnboardingController extends Controller
{
    public const GSTIN_REGEX = '/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/';

    /** Steps 2–3: business type + details → creates the business. */
    public function store(Request $request, CreateBusiness $createBusiness): JsonResponse
    {
        if ($request->filled('gstin')) {
            $request->merge(['gstin' => strtoupper(preg_replace('/\s+/', '', $request->input('gstin')))]);
        }

        $data = $request->validate([
            'business_type' => ['required', Rule::in(Tenant::TYPES)],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'city' => ['required', 'string', 'min:2', 'max:80'],
            'gstin' => ['nullable', 'regex:'.self::GSTIN_REGEX],
            ...OpeningHours::rules(),
        ], [
            'gstin.regex' => 'Enter a valid 15-character GSTIN, e.g. 08ABCDE1234F1Z5, or leave it empty.',
            'opening_hours.*.close.different' => 'Opening and closing time cannot be the same.',
        ]);

        $createBusiness($request->user(), $data);

        return $this->created(SessionPayload::for($request->user()->fresh()), 'Your business is set up.');
    }
}
