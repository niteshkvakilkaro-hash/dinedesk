<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * /.well-known/assetlinks.json: proves to Android that an app (a Trusted Web Activity built with
 * Bubblewrap) belongs to this website, so it opens full-screen with no browser bar. A business
 * website lists its own app (setting "android_app"); the platform domain lists the dashboard app.
 */
class AndroidAppController extends Controller
{
    public const SETTING = 'android_app';

    public function __construct(private readonly TenantResolver $resolver, private readonly TenantContext $context) {}

    public function assetLinks(Request $request): JsonResponse
    {
        $tenant = $this->resolver->resolve($this->resolver->hostFrom($request));
        $app = $tenant
            ? $this->context->run($tenant, fn () => app(TenantSettings::class)->get(self::SETTING))
            : ['package' => config('dinedesk.android.admin_package'), 'sha256' => config('dinedesk.android.admin_sha256')];

        $links = ! empty($app['package']) && ! empty($app['sha256']) ? [[
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => ['namespace' => 'android_app', 'package_name' => $app['package'], 'sha256_cert_fingerprints' => array_values($app['sha256'])],
        ]] : [];

        return response()->json($links, 200, ['Cache-Control' => 'public, max-age=3600'], JSON_UNESCAPED_SLASHES);
    }
}
