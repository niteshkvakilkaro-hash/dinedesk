<?php

namespace App\Modules\Website\Services;

use App\Modules\Settings\Services\TenantSettings;
use App\Support\Phone;

/**
 * The words on a business's website, kept in tenant settings under
 * "site_content". Nothing here is ever invented for a real business:
 * empty fields render nothing (or an owner-only hint), never filler.
 */
class SiteContent
{
    public const KEY = 'site_content';

    public const SOCIALS = ['instagram', 'facebook', 'youtube', 'google_maps'];

    public function __construct(private readonly TenantSettings $settings) {}

    public static function empty(): array
    {
        return [
            'tagline' => null,
            'tagline_hi' => null,
            'about' => null,
            'about_hi' => null,
            'milestones' => [],
            'contact' => [
                'phone' => null,
                'whatsapp' => null,
                // Shown on the site only after the owner confirms the number is on WhatsApp.
                'whatsapp_verified' => false,
                'email' => null,
                'address' => null,
                'map_url' => null,
                'parking' => null,
            ],
            'socials' => array_fill_keys(self::SOCIALS, null),
            'seo' => ['description' => null, 'description_hi' => null],
            // Footer: FSSAI licence number, and whether to show the GSTIN from business details.
            'legal' => ['fssai' => null, 'show_gstin' => false],
        ];
    }

    public static function rules(): array
    {
        $url = ['nullable', 'url:https', 'max:300'];

        return [
            'tagline' => ['nullable', 'string', 'max:140'],
            'tagline_hi' => ['nullable', 'string', 'max:140'],
            'about' => ['nullable', 'string', 'max:3000'],
            'about_hi' => ['nullable', 'string', 'max:3000'],
            'milestones' => ['present', 'array', 'max:12'],
            'milestones.*.year' => ['required', 'string', 'max:10'],
            'milestones.*.title' => ['required', 'string', 'max:80'],
            'milestones.*.title_hi' => ['nullable', 'string', 'max:80'],
            'milestones.*.text' => ['nullable', 'string', 'max:300'],
            'milestones.*.text_hi' => ['nullable', 'string', 'max:300'],
            'contact' => ['required', 'array'],
            'contact.phone' => ['nullable', 'string', 'regex:/^\+?[0-9][0-9\s\-()]{5,19}$/'],
            'contact.whatsapp' => ['nullable', 'string', Phone::RULE],
            'contact.whatsapp_verified' => ['boolean'],
            'contact.email' => ['nullable', 'email:rfc', 'max:120'],
            'contact.address' => ['nullable', 'string', 'max:300'],
            'contact.map_url' => $url,
            'contact.parking' => ['nullable', 'string', 'max:160'],
            'socials' => ['required', 'array'],
            ...collect(self::SOCIALS)->mapWithKeys(fn ($s) => ["socials.{$s}" => $url])->all(),
            'seo' => ['required', 'array'],
            'seo.description' => ['nullable', 'string', 'max:160'],
            'seo.description_hi' => ['nullable', 'string', 'max:160'],
            'legal' => ['sometimes', 'array'],
            'legal.fssai' => ['nullable', 'regex:/^\d{14}$/'],
            'legal.show_gstin' => ['sometimes', 'boolean'],
        ];
    }

    public static function messages(): array
    {
        return [
            'contact.phone.regex' => 'Enter a valid phone number.',
            'contact.whatsapp.regex' => Phone::MESSAGE,
            'contact.map_url.url' => 'Use a full https:// link, e.g. from Google Maps → Share.',
            'socials.*.url' => 'Use a full https:// link.',
            'legal.fssai.regex' => 'The FSSAI licence number has 14 digits.',
        ];
    }

    public function get(): array
    {
        return array_replace_recursive(self::empty(), (array) $this->settings->get(self::KEY, []));
    }

    public function save(array $data): array
    {
        $clean = self::empty();
        $text = fn ($v) => $v === null || trim((string) $v) === '' ? null : trim(strip_tags((string) $v));

        foreach (['tagline', 'tagline_hi', 'about', 'about_hi'] as $f) {
            $clean[$f] = $text($data[$f] ?? null);
        }
        $clean['milestones'] = array_values(array_map(fn ($m) => [
            'year' => $text($m['year']),
            'title' => $text($m['title']),
            'title_hi' => $text($m['title_hi'] ?? null),
            'text' => $text($m['text'] ?? null),
            'text_hi' => $text($m['text_hi'] ?? null),
        ], $data['milestones'] ?? []));

        $c = $data['contact'] ?? [];
        $whatsapp = ! empty($c['whatsapp']) ? Phone::normalize($c['whatsapp']) : null;
        $clean['contact'] = [
            'phone' => ! empty($c['phone']) ? Phone::normalize($c['phone']) : null,
            'whatsapp' => $whatsapp,
            'whatsapp_verified' => $whatsapp !== null && (bool) ($c['whatsapp_verified'] ?? false),
            'email' => $text($c['email'] ?? null),
            'address' => $text($c['address'] ?? null),
            'map_url' => $text($c['map_url'] ?? null),
            'parking' => $text($c['parking'] ?? null),
        ];
        foreach (self::SOCIALS as $s) {
            $clean['socials'][$s] = $text($data['socials'][$s] ?? null);
        }
        $clean['seo'] = [
            'description' => $text($data['seo']['description'] ?? null),
            'description_hi' => $text($data['seo']['description_hi'] ?? null),
        ];

        $clean['legal'] = [
            'fssai' => $text($data['legal']['fssai'] ?? null),
            'show_gstin' => (bool) ($data['legal']['show_gstin'] ?? false),
        ];

        $this->settings->set(self::KEY, $clean);

        return $clean;
    }

    /** What visitors may see: the WhatsApp number only once confirmed. */
    public function forPublic(): array
    {
        $content = $this->get();
        if (! $content['contact']['whatsapp_verified']) {
            $content['contact']['whatsapp'] = null;
        }
        unset($content['contact']['whatsapp_verified']);

        return $content;
    }
}
