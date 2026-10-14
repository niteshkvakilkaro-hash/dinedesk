<?php

namespace App\Modules\Website\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Models\ThemeSetting;
use App\Modules\Website\Services\SiteContent;
use App\Modules\Website\Services\SitePresenter;
use App\Modules\Website\Support\Themes;
use App\Support\Images\ImageService;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Website: theme, colours, logo/cover, section order and site content. */
class WebsiteController extends Controller
{
    public const IMAGE_SLOTS = ['logo', 'cover'];

    public function __construct(
        private readonly TenantContext $context,
        private readonly SiteContent $content,
        private readonly SitePresenter $presenter,
        private readonly ImageService $images,
    ) {}

    public function show(): JsonResponse
    {
        return $this->ok($this->payload());
    }

    public function updateTheme(Request $request): JsonResponse
    {
        $data = $request->validate(self::themeRules());
        $theme = self::applyTheme(ThemeSetting::current(), $data);

        AuditLog::record('website.theme_updated', $this->context->require(), array_intersect_key($data, array_flip(['theme', 'primary_color', 'accent_color'])));

        return $this->ok($this->payload(), 'Theme saved.', ['warnings' => Themes::contrastWarnings($theme->theme, $theme->primary_color, $theme->accent_color)]);
    }

    public function updateContent(Request $request): JsonResponse
    {
        if ($request->filled('contact.whatsapp')) {
            $request->merge(['contact' => ['whatsapp' => Phone::normalize($request->input('contact.whatsapp'))] + $request->input('contact')]);
        }
        $data = $request->validate(SiteContent::rules(), SiteContent::messages());
        $this->content->save($data);

        AuditLog::record('website.content_updated', $this->context->require());

        return $this->ok($this->payload(), 'Website content saved.');
    }

    public function uploadImage(Request $request, string $slot): JsonResponse
    {
        abort_unless(in_array($slot, self::IMAGE_SLOTS, true), 404);
        $request->validate(['image' => ImageService::rules()], [
            'image.dimensions' => 'Images must be at least 200×200 pixels.',
            'image.max' => 'Images must be smaller than '.(config('dinedesk.images.max_kb') / 1024).' MB.',
        ]);

        $theme = ThemeSetting::current();
        $old = $theme->{$slot};
        $theme->update([$slot => $this->images->store($request->file('image'), $this->context->require(), "website/{$slot}")]);
        $this->images->delete($old);

        AuditLog::record("website.{$slot}_uploaded", $this->context->require());

        return $this->ok($this->payload(), ucfirst($slot).' updated.');
    }

    public function deleteImage(string $slot): JsonResponse
    {
        abort_unless(in_array($slot, self::IMAGE_SLOTS, true), 404);
        $theme = ThemeSetting::current();
        $this->images->delete($theme->{$slot});
        $theme->update([$slot => null]);

        AuditLog::record("website.{$slot}_removed", $this->context->require());

        return $this->ok($this->payload(), ucfirst($slot).' removed.');
    }

    /** Shared with onboarding step 4–5. */
    public static function themeRules(): array
    {
        return [
            'theme' => ['sometimes', 'required', Rule::in(Themes::keys())],
            'primary_color' => ['sometimes', 'nullable', 'regex:'.Themes::HEX],
            'accent_color' => ['sometimes', 'nullable', 'regex:'.Themes::HEX],
            'sections' => ['sometimes', 'array', 'max:'.count(Themes::SECTIONS)],
            'sections.*.key' => ['required', 'distinct', Rule::in(Themes::SECTIONS)],
            'sections.*.visible' => ['required', 'boolean'],
        ];
    }

    public static function applyTheme(ThemeSetting $theme, array $data): ThemeSetting
    {
        foreach (['primary_color', 'accent_color'] as $f) {
            if (array_key_exists($f, $data) && $data[$f] !== null) {
                $data[$f] = strtoupper($data[$f]);
            }
        }
        if (isset($data['sections'])) {
            $data['sections'] = Themes::normalizeSections($data['sections']);
        }
        $theme->update(array_intersect_key($data, array_flip(['theme', 'primary_color', 'accent_color', 'sections'])));

        return $theme;
    }

    private function payload(): array
    {
        $theme = ThemeSetting::current();

        return [
            'theme' => $this->presenter->theme($theme),
            'content' => $this->content->get(),
            'warnings' => Themes::contrastWarnings($theme->theme, $theme->primary_color, $theme->accent_color),
            'themes' => collect(Themes::CATALOGUE)->map(fn ($t, $key) => ['key' => $key] + $t)->values(),
            'site_url' => '//'.$this->presenter->primaryHost($this->context->require()),
            // Listed in the DineDesk app's place finder (owners can opt out).
            'directory_listed' => app(TenantSettings::class)->get(DirectoryController::SETTING) !== false,
        ];
    }
}
