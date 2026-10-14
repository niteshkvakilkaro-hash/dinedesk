<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Settings\Models\Setting;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Settings\Support\OpeningHours;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Models\ThemeSetting;
use App\Support\ApiException;
use App\Support\Images\ImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The DineDesk app's "Find a restaurant or hotel": live, published businesses (branches too: each
 * has its own website), real ones first and demos last, labelled. Only what each business's public
 * website already shows (name, type, city, logo, cover, open now) is listed. Owners can opt out.
 */
class DirectoryController extends Controller
{
    /** Tenant setting: false hides the business from the app directory (default: listed). */
    public const SETTING = 'directory_listed';

    public const PER_PAGE = 20;

    public function __construct(private readonly TenantResolver $resolver, private readonly ImageService $images) {}

    public function index(Request $request): JsonResponse
    {
        // Not on a business website: a business site has no directory of other businesses.
        if ($this->resolver->resolve($this->resolver->hostFrom($request))) {
            throw new ApiException('Not found.', 404, 'not_found');
        }
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:80'],
            'city' => ['nullable', 'string', 'max:80'],
            'page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);
        $like = fn (string $v) => '%'.addcslashes(mb_strtolower(trim($v)), '%_\\').'%';

        // The few businesses that opted out (a boolean in their settings).
        $hidden = Setting::withoutTenancy()->where('key', self::SETTING)->get(['tenant_id', 'value'])
            ->filter(fn (Setting $s) => $s->value === false)->pluck('tenant_id')->all();

        $page = Tenant::query()
            ->where('status', 'live')
            ->whereNotIn('id', $hidden)
            ->when(! empty($data['q']), fn ($q) => $q->where(fn ($w) => $w
                ->whereRaw('LOWER(name) LIKE ?', [$like($data['q'])])
                ->orWhereRaw('LOWER(city) LIKE ?', [$like($data['q'])])))
            ->when(! empty($data['city']), fn ($q) => $q->whereRaw('LOWER(city) LIKE ?', [$like($data['city'])]))
            ->orderBy('is_demo')
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(self::PER_PAGE, ['id', 'name', 'slug', 'business_type', 'city', 'timezone', 'is_demo']);

        $rows = $this->rows($page->getCollection());

        return $this->ok($rows, null, [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    /**
     * A scanned QR code or typed address on a business's own domain: is it a live DineDesk place?
     * (Opted-out businesses still open from their own QR codes.)
     */
    public function place(Request $request): JsonResponse
    {
        $data = $request->validate(['host' => ['required', 'string', 'max:253']]);
        $tenant = $this->resolver->resolve($data['host']);
        if (! $tenant || $tenant->status !== 'live') {
            throw new ApiException('This is not a DineDesk place.', 404, 'not_a_place');
        }

        return $this->ok($this->rows(collect([$tenant]))[0]);
    }

    /** @param Collection<int, Tenant> $tenants */
    private function rows(Collection $tenants): array
    {
        $ids = $tenants->pluck('id')->all();
        $themes = ThemeSetting::withoutTenancy()->whereIn('tenant_id', $ids)->get(['tenant_id', 'logo', 'cover'])->keyBy('tenant_id');
        $settings = Setting::withoutTenancy()->whereIn('tenant_id', $ids)->whereIn('key', ['opening_hours', 'holidays'])->get(['tenant_id', 'key', 'value'])->groupBy('tenant_id');
        $primary = TenantDomain::whereIn('tenant_id', $ids)->where('is_primary', true)->pluck('domain', 'tenant_id');

        return $tenants->map(function (Tenant $t) use ($themes, $settings, $primary) {
            $host = $primary[$t->id] ?? TenantResolver::subdomainFor($t->slug);
            $s = ($settings[$t->id] ?? collect())->pluck('value', 'key');
            $hours = $s['opening_hours'] ?? null;
            $theme = $themes[$t->id] ?? null;

            return [
                'name' => $t->name,
                'slug' => $t->slug,
                'host' => $host,
                'url' => rtrim(str_replace('{host}', $host, (string) config('dinedesk.site_url_pattern')), '/'),
                'business_type' => $t->business_type,
                'city' => $t->city,
                'logo' => $this->image($theme?->logo),
                'cover' => $this->image($theme?->cover),
                'is_open' => is_array($hours) && $hours ? OpeningHours::status($hours, $t->timezone ?: 'Asia/Kolkata', null, (array) ($s['holidays'] ?? []))['is_open'] : null,
                'is_demo' => (bool) $t->is_demo,
            ];
        })->values()->all();
    }

    /** Dashboard → Website: show this business in the DineDesk app directory (on by default). */
    public function update(Request $request, TenantContext $context, TenantSettings $settings): JsonResponse
    {
        $data = $request->validate(['listed' => ['required', 'boolean']]);
        $settings->set(self::SETTING, (bool) $data['listed']);
        AuditLog::record($data['listed'] ? 'website.directory_on' : 'website.directory_off', $context->require());

        return $this->ok(['listed' => (bool) $data['listed']], 'Saved.');
    }

    /** @return array{src: string, srcset: string, width: int, height: int}|null */
    private function image(?array $stored): ?array
    {
        $img = $this->images->present($stored);

        return $img ? array_intersect_key($img, array_flip(['src', 'srcset', 'width', 'height'])) : null;
    }
}
