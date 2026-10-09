<?php

namespace App\Modules\Tenancy\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;

/**
 * Public website bootstrap: what the site at this host needs to render.
 * Phase 2 adds theme, branding, pages and SEO data here.
 */
class PublicSiteController extends Controller
{
    public function show(TenantContext $context, TenantSettings $settings): JsonResponse
    {
        $tenant = $context->require();
        $hours = $settings->get('opening_hours');

        return $this->ok([
            'name' => $tenant->name,
            'business_type' => $tenant->business_type,
            'city' => $tenant->city,
            'status' => $tenant->status,
            'is_live' => $tenant->status === 'live',
            'is_demo' => $tenant->is_demo,
            'timezone' => $tenant->timezone,
            'opening_hours' => $hours,
            'open_status' => $hours ? OpeningHours::status($hours, $tenant->timezone) : null,
        ]);
    }
}
