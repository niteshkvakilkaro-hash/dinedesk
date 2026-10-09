<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use Illuminate\Http\JsonResponse;

/** Public website data; the business comes from the visitor's host (tenant.host). */
class PublicSiteController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function show(): JsonResponse
    {
        return $this->ok($this->presenter->site($this->context->require()));
    }

    public function menu(): JsonResponse
    {
        return $this->ok($this->presenter->menu());
    }

    public function gallery(): JsonResponse
    {
        return $this->ok($this->presenter->gallery());
    }
}
