<?php

namespace App\Modules\Settings\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Onboarding\Http\Controllers\OnboardingController;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The owner edits what they entered during onboarding. */
class BusinessController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly TenantSettings $settings,
    ) {}

    public function show(): JsonResponse
    {
        return $this->ok($this->payload());
    }

    public function update(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        if ($request->filled('gstin')) {
            $request->merge(['gstin' => strtoupper(preg_replace('/\s+/', '', $request->input('gstin')))]);
        }

        $rules = [
            'name' => ['sometimes', 'string', 'min:2', 'max:120'],
            'city' => ['sometimes', 'string', 'min:2', 'max:80'],
            'gstin' => ['sometimes', 'nullable', 'regex:'.OnboardingController::GSTIN_REGEX],
            'timezone' => ['sometimes', 'timezone:all'],
        ];
        if ($request->has('opening_hours')) {
            $rules += OpeningHours::rules();
        }
        if ($request->has('holidays')) {
            $rules += OpeningHours::holidayRules();
        }
        $data = $request->validate($rules, ['gstin.regex' => 'Enter a valid 15-character GSTIN or leave it empty.']);

        $fields = array_intersect_key($data, array_flip(['name', 'city', 'gstin', 'timezone']));
        foreach (['name', 'city'] as $f) {
            if (isset($fields[$f])) {
                $fields[$f] = strip_tags($fields[$f]);
            }
        }
        $tenant->update($fields);

        if (isset($data['opening_hours'])) {
            $this->settings->set('opening_hours', OpeningHours::normalize($data['opening_hours']));
        }
        if (isset($data['holidays'])) {
            $this->settings->set('holidays', OpeningHours::normalizeHolidays($data['holidays']));
        }

        AuditLog::record('business.updated', $tenant, ['fields' => array_keys($data)]);

        return $this->ok($this->payload(), 'Business details saved.');
    }

    /** Dashboard "Get started" list: hidden for the whole business (every owner, every device). */
    public function getStarted(Request $request): JsonResponse
    {
        $hidden = (bool) $request->validate(['hidden' => ['required', 'boolean']])['hidden'];
        $this->settings->set('get_started_hidden', $hidden);

        return $this->ok(['get_started_hidden' => $hidden]);
    }

    private function payload(): array
    {
        $tenant = $this->context->require()->fresh();

        return [
            'name' => $tenant->name,
            'business_type' => $tenant->business_type,
            'city' => $tenant->city,
            'gstin' => $tenant->gstin,
            'timezone' => $tenant->timezone,
            'opening_hours' => $this->settings->get('opening_hours'),
            'holidays' => $this->settings->get('holidays', []),
            'get_started_hidden' => (bool) $this->settings->get('get_started_hidden', false),
        ];
    }
}
