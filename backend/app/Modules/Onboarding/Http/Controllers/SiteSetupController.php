<?php

namespace App\Modules\Onboarding\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Support\SessionPayload;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Menu\Support\SampleMenu;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Models\TenantDomain;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Modules\Website\Http\Controllers\WebsiteController;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Services\SiteContent;
use App\Modules\Website\Support\Themes;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Onboarding steps 4–7, after the business exists:
 * 4 theme → 5 branding → 6 menu (own menu read by AI, sample, or skip) → 7 subdomain + go live.
 * onboarding_step only moves forward; the wizard may revisit earlier steps.
 */
class SiteSetupController extends Controller
{
    public const SLUG_REGEX = '/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/';

    public function __construct(
        private readonly TenantContext $context,
        private readonly SiteContent $content,
    ) {}

    public function theme(Request $request): JsonResponse
    {
        $data = $request->validate(['theme' => ['required', Rule::in(Themes::keys())]]);
        WebsiteController::applyTheme(ThemeSetting::current(), $data);
        $this->advanceTo(5);
        AuditLog::record('onboarding.theme', $this->context->require(), $data);

        return $this->session($request);
    }

    public function branding(Request $request): JsonResponse
    {
        $data = $request->validate([
            'primary_color' => ['nullable', 'regex:'.Themes::HEX],
            'accent_color' => ['nullable', 'regex:'.Themes::HEX],
            'tagline' => ['nullable', 'string', 'max:140'],
            'tagline_hi' => ['nullable', 'string', 'max:140'],
        ]);
        $theme = WebsiteController::applyTheme(ThemeSetting::current(), [
            'primary_color' => $data['primary_color'] ?? null,
            'accent_color' => $data['accent_color'] ?? null,
        ]);
        $content = $this->content->get();
        $content['tagline'] = $data['tagline'] ?? null;
        $content['tagline_hi'] = $data['tagline_hi'] ?? null;
        $this->content->save($content);

        $this->advanceTo(6);

        return $this->session($request, ['warnings' => Themes::contrastWarnings($theme->theme, $theme->primary_color, $theme->accent_color)]);
    }

    public function menu(Request $request): JsonResponse
    {
        // 'imported': the owner has already added their own dishes (AI read of the printed menu).
        $data = $request->validate(['mode' => ['required', Rule::in(['sample', 'skip', 'imported'])]]);
        $tenant = $this->context->require();

        if ($data['mode'] === 'imported') {
            $dishes = MenuItem::count();
            if ($dishes === 0) {
                throw new ApiException('Add your dishes first, or pick another option.', 422, 'menu_empty', ['field' => 'mode']);
            }
            AuditLog::record('onboarding.menu_imported', $tenant, ['dishes' => $dishes]);
        }

        if ($data['mode'] === 'sample' && ! MenuCategory::exists()) {
            DB::transaction(fn () => SampleMenu::install(SampleMenu::keyFor($tenant->business_type)));
            AuditLog::record('onboarding.sample_menu', $tenant);
        }
        $this->advanceTo(7);

        return $this->session($request);
    }

    public function subdomain(Request $request): JsonResponse
    {
        $slug = strtolower(trim((string) $request->query('slug')));

        return $this->ok(['slug' => $slug, 'host' => TenantResolver::subdomainFor($slug)] + $this->slugProblem($slug, $this->context->require()));
    }

    public function goLive(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $data = $request->validate(['slug' => ['required', 'string']]);
        $slug = strtolower(trim($data['slug']));

        if ($tenant->status !== 'onboarding') {
            throw new ApiException('Your website is already live.', 409, 'already_live');
        }
        if ($tenant->onboarding_step < 7) {
            throw new ApiException('Finish the earlier steps first.', 409, 'steps_incomplete');
        }
        $check = $this->slugProblem($slug, $tenant);
        if (! $check['available']) {
            throw new ApiException($check['message'], 422, 'slug_unavailable', ['field' => 'slug']);
        }

        DB::transaction(function () use ($tenant, $slug) {
            if ($slug !== $tenant->slug) {
                $old = $tenant->slug;
                TenantDomain::where('tenant_id', $tenant->id)->where('type', 'subdomain')
                    ->update(['domain' => TenantResolver::subdomainFor($slug)]);
                $tenant->slug = $slug;
                AuditLog::record('tenant.slug_changed', $tenant, ['from' => $old, 'to' => $slug]);
            }
            $tenant->status = 'live';
            $tenant->onboarding_step = 8;
            $tenant->save();
            AuditLog::record('tenant.went_live', $tenant, ['host' => TenantResolver::subdomainFor($slug)]);
        });

        return $this->session($request, null, 'Your website is live!');
    }

    /** @return array{available: bool, message: ?string, suggestion: ?string} */
    private function slugProblem(string $slug, Tenant $tenant): array
    {
        $message = match (true) {
            strlen($slug) < 3 || strlen($slug) > 40 => 'Use 3 to 40 characters.',
            ! preg_match(self::SLUG_REGEX, $slug) => 'Use lowercase letters, numbers and hyphens only (not at the start or end).',
            str_contains($slug, '--') => 'Avoid double hyphens.',
            in_array($slug, config('dinedesk.reserved_slugs'), true) => 'That name is reserved. Please choose another.',
            $slug !== $tenant->slug && (
                Tenant::withTrashed()->where('slug', $slug)->exists()
                || TenantDomain::where('domain', TenantResolver::subdomainFor($slug))->exists()
            ) => 'That address is already taken.',
            default => null,
        };

        $suggestion = null;
        if ($message === 'That address is already taken.') {
            for ($i = 2; $i < 50 && ! $suggestion; $i++) {
                $try = substr($slug, 0, 36)."-{$i}";
                if (! Tenant::withTrashed()->where('slug', $try)->exists() && ! TenantDomain::where('domain', TenantResolver::subdomainFor($try))->exists()) {
                    $suggestion = $try;
                }
            }
        }

        return ['available' => $message === null, 'message' => $message, 'suggestion' => $suggestion];
    }

    private function advanceTo(int $step): void
    {
        $tenant = $this->context->require();
        if ($tenant->status === 'onboarding' && $tenant->onboarding_step < $step) {
            $tenant->update(['onboarding_step' => $step]);
        }
    }

    private function session(Request $request, ?array $meta = null, ?string $message = null): JsonResponse
    {
        return $this->ok(SessionPayload::for($request->user()->fresh()), $message, $meta);
    }
}
