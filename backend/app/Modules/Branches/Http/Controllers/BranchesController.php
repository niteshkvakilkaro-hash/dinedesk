<?php

namespace App\Modules\Branches\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Branches\Services\Branches;
use App\Modules\Identity\Support\SessionPayload;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Dashboard → Branches (Pro): outlets of the business, switching, combined report, menu copy. */
class BranchesController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly Branches $branches) {}

    public function index(FeatureService $features): JsonResponse
    {
        $tenant = $this->context->require();
        $family = $this->branches->family($tenant);
        $root = $family[0];
        $limit = $features->limit($root, 'branches');

        return $this->ok([
            'outlets' => array_map(fn (Tenant $t) => [
                'id' => $t->public_id,
                'name' => $t->name,
                'city' => $t->city,
                'status' => $t->status,
                'is_main' => $t->parent_tenant_id === null,
                'current' => $t->id === $tenant->id,
                'site_host' => TenantResolver::subdomainFor($t->slug),
                // Everyone with a role in the outlet (the owner has one in every outlet).
                'staff' => DB::table('model_has_roles')->where('model_type', User::class)->where('tenant_id', $t->id)->distinct()->count('model_id'),
            ], $family),
            'enabled' => $features->enabled($root, 'multi_branch'),
            'limit' => $limit,
            'can_add' => $features->enabled($root, 'multi_branch') && ($limit === null || count($family) < $limit),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'city' => ['required', 'string', 'min:2', 'max:80'],
            'business_type' => ['nullable', Rule::in(Tenant::TYPES)],
            'copy_menu' => ['boolean'],
            'copy_theme' => ['boolean'],
        ]);
        $branch = $this->branches->create($this->context->require(), $data, $request->user());

        return $this->created(['id' => $branch->public_id, 'name' => $branch->name, 'site_host' => TenantResolver::subdomainFor($branch->slug)], 'Branch added. Switch to it to finish its setup.');
    }

    /** Work in another outlet (the dashboard reloads the session). */
    public function switch(Request $request, string $publicId): JsonResponse
    {
        $target = Tenant::where('public_id', $publicId)->firstOrFail();
        $user = $request->user();
        $this->branches->switchTo($user, $target);

        return $this->ok(SessionPayload::for($user->fresh()), "Now working in {$target->name}.");
    }

    public function report(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $data = $request->validate(['from' => ['nullable', 'date_format:Y-m-d'], 'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from']]);
        $today = CarbonImmutable::now($tenant->timezone);
        $from = $data['from'] ?? $today->subDays(29)->format('Y-m-d');
        $to = $data['to'] ?? $today->format('Y-m-d');

        return $this->ok($this->branches->report($tenant, $from, $to));
    }

    public function copyMenu(string $publicId): JsonResponse
    {
        $from = $this->context->require();
        $to = Tenant::where('public_id', $publicId)->firstOrFail();
        if ($to->billingRoot()->id !== $from->billingRoot()->id || $to->id === $from->id) {
            abort(404);
        }
        $count = $this->branches->copyMenu($from, $to);
        $this->context->set($from);

        return $this->ok(['dishes' => $count], "{$count} dishes copied to {$to->name}.");
    }
}
