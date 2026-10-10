<?php

namespace App\Modules\Domains\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Domains\Services\CustomDomains;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Dashboard → Domain: connect your own domain to the website. */
class DomainsController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly CustomDomains $domains) {}

    public function index(FeatureService $features): JsonResponse
    {
        $tenant = $this->context->require();

        return $this->ok([
            'domains' => TenantDomain::where('tenant_id', $tenant->id)->orderByRaw("type = 'custom'")->orderBy('id')->get()->map(fn (TenantDomain $d) => [
                'id' => $d->id, 'domain' => $d->domain, 'type' => $d->type, 'is_primary' => $d->is_primary, 'verified' => (bool) $d->verified_at,
                'verified_at' => $d->verified_at?->toIso8601String(),
            ])->values(),
            'enabled' => $features->enabled($tenant, 'custom_domain'),
            'cname_target' => config('dinedesk.domains.cname_target'),
            'ips' => array_values((array) config('dinedesk.domains.ips')),
            'max' => CustomDomains::MAX_PER_BUSINESS,
        ]);
    }

    public function store(Request $request, FeatureService $features): JsonResponse
    {
        $data = $request->validate(['domain' => ['required', 'string', 'max:253']]);
        $this->domains->add($this->context->require(), $data['domain']);

        return $this->index($features)->setStatusCode(201);
    }

    public function verify(int $id, FeatureService $features): JsonResponse
    {
        $this->domains->verify($this->find($id));

        return $this->index($features);
    }

    public function primary(int $id, FeatureService $features): JsonResponse
    {
        $this->domains->makePrimary($this->find($id));

        return $this->index($features);
    }

    public function destroy(int $id, FeatureService $features): JsonResponse
    {
        $this->domains->remove($this->find($id));

        return $this->index($features);
    }

    /** GET /api/v1/tls/ask?domain=… — Caddy asks before issuing a certificate (200 = yes). */
    public function ask(Request $request): Response
    {
        return response('', $this->domains->allowsCertificate((string) $request->query('domain')) ? 200 : 404);
    }

    private function find(int $id): TenantDomain
    {
        return TenantDomain::where('tenant_id', $this->context->id())->findOrFail($id);
    }
}
