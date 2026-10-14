<?php

namespace App\Modules\Menu\Services;

use App\Models\User;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Marketing\Models\Banner;
use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Services\SiteContent;
use App\Support\Ai\Ai;
use App\Support\ApiException;
use App\Support\Translations;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The owner's own words (menu, rooms, offers, website tagline/about) in the site languages
 * other than English and Hindi. One flat list of entries keyed "item:12:name", in menu order;
 * the AI only drafts, the owner saves. Runs in the tenant's context, so every query is that
 * business's own.
 */
class ContentTranslations
{
    /** Translatable fields per kind of entry, with the English field's max length. */
    public const FIELDS = [
        'category' => ['name' => 100],
        'item' => ['name' => 150, 'description' => 1000],
        'variant' => ['name' => 60],
        'group' => ['name' => 80],
        'addon' => ['name' => 80],
        'room' => ['name' => 80, 'description' => 1500],
        'banner' => ['title' => 120, 'text' => 300],
        'site' => ['tagline' => 140, 'about' => 3000],
    ];

    public const MAX_AI_KEYS = 120;

    public function __construct(
        private readonly FeatureService $features,
        private readonly SiteContent $content,
        private readonly Ai $ai,
    ) {}

    /**
     * Everything this person may translate, with the current text in $lang.
     *
     * @return list<array{key: string, group: string, type: string, field: string, label: ?string, source: string, hi: ?string, value: string, max: int, record: ?Model}>
     */
    public function entries(Tenant $tenant, User $user, string $lang): array
    {
        $out = [];
        $add = function (string $group, string $type, string|int $id, ?Model $record, ?string $label, array $source, array $current) use (&$out, $lang) {
            foreach (self::FIELDS[$type] as $field => $max) {
                $text = trim((string) ($source[$field] ?? ''));
                if ($text === '') {
                    continue;
                }
                $hi = trim((string) ($source["{$field}_hi"] ?? ''));
                $out[] = [
                    'key' => "{$type}:{$id}:{$field}",
                    'group' => $group,
                    'type' => $type,
                    'field' => $field,
                    'label' => $label,
                    'source' => $text,
                    'hi' => $hi !== '' ? $hi : null,
                    'value' => (string) ($current[$lang][$field] ?? ''),
                    'max' => $max,
                    'record' => $record,
                ];
            }
        };

        foreach (MenuCategory::with('items.variants')->orderBy('sort_order')->orderBy('id')->get() as $c) {
            $add('menu', 'category', $c->id, $c, null, $c->getAttributes(), $c->translations ?? []);
            foreach ($c->items as $i) {
                $add('menu', 'item', $i->id, $i, $c->name, $i->getAttributes(), $i->translations ?? []);
                foreach ($i->variants as $v) {
                    $add('menu', 'variant', $v->id, $v, $i->name, $v->getAttributes(), $v->translations ?? []);
                }
            }
        }
        foreach (AddonGroup::with('addons')->orderBy('sort_order')->orderBy('id')->get() as $g) {
            $add('menu', 'group', $g->id, $g, null, $g->getAttributes(), $g->translations ?? []);
            foreach ($g->addons as $a) {
                $add('menu', 'addon', $a->id, $a, $g->name, $a->getAttributes(), $a->translations ?? []);
            }
        }
        // Rooms, offers and the website only for people who may edit those (same rules as their own pages).
        if ($this->features->enabled($tenant, 'hotel') && $this->can($user, 'rooms.setup')) {
            foreach (RoomType::orderBy('sort_order')->orderBy('id')->get() as $r) {
                $add('rooms', 'room', $r->id, $r, null, $r->getAttributes(), $r->translations ?? []);
            }
        }
        if ($this->features->enabled($tenant, 'coupons') && $this->can($user, 'marketing.manage')) {
            foreach (Banner::orderBy('sort_order')->orderByDesc('id')->get() as $b) {
                $add('banners', 'banner', $b->id, $b, null, $b->getAttributes(), $b->translations ?? []);
            }
        }
        if ($this->features->enabled($tenant, 'website') && $this->can($user, 'theme.manage')) {
            $site = $this->content->get();
            $add('website', 'site', 0, null, null, $site, $site['translations']);
        }

        return $out;
    }

    /**
     * Saves the given texts (an empty text removes that translation).
     *
     * @param  array<string, string|null>  $values  key => text
     * @return int how many texts changed
     */
    public function save(Tenant $tenant, User $user, string $lang, array $values): int
    {
        $entries = $this->known($tenant, $user, $lang, array_keys($values));
        $errors = [];
        foreach ($values as $key => $text) {
            if (mb_strlen(trim((string) $text)) > $entries[$key]['max']) {
                $errors["values.{$key}"] = "Keep this under {$entries[$key]['max']} characters.";
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        $changed = 0;
        $records = [];
        $site = [];
        foreach ($values as $key => $text) {
            $e = $entries[$key];
            $text = trim(strip_tags((string) $text));
            if ($text === $e['value']) {
                continue;
            }
            $changed++;
            if ($e['record']) {
                $e['record']->translations = Translations::put($e['record']->translations, $lang, $e['field'], $text);
                $records[spl_object_id($e['record'])] = $e['record'];
            } else {
                $site[$e['field']] = $text;
            }
        }
        DB::transaction(function () use ($records, $site, $lang) {
            foreach ($records as $record) {
                $record->save();
            }
            if ($site) {
                $this->content->saveTranslations($lang, $site);
            }
        });

        return $changed;
    }

    /**
     * AI drafts for the owner to check; nothing is saved.
     *
     * @param  list<string>  $keys
     * @return array<string, string> key => text
     */
    public function suggest(Tenant $tenant, User $user, string $lang, array $keys): array
    {
        $entries = array_intersect_key($this->byKey($tenant, $user, $lang), array_flip($keys));
        if (! $entries) {
            throw new ApiException('Nothing to translate.', 422, 'nothing_to_translate');
        }
        $language = Translations::NAMES[$lang];
        $lines = array_map(fn ($e) => array_filter([
            'key' => $e['key'],
            'what' => self::describe($e),
            'english' => $e['source'],
            'hindi' => $e['hi'],
        ], fn ($v) => $v !== null), array_values($entries));

        $data = $this->ai->json(self::system($language), [[
            'type' => 'text',
            'text' => "Translate each \"english\" text into {$language}. Return one translation per key.\n\n".json_encode($lines, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        ]], [
            'type' => 'object',
            'properties' => ['translations' => ['type' => 'array', 'items' => [
                'type' => 'object',
                'properties' => ['key' => ['type' => 'string'], 'text' => ['type' => 'string']],
                'required' => ['key', 'text'],
                'additionalProperties' => false,
            ]]],
            'required' => ['translations'],
            'additionalProperties' => false,
        ]);

        $out = [];
        foreach ((array) ($data['translations'] ?? []) as $row) {
            $key = (string) ($row['key'] ?? '');
            // Only keys that were asked for; anything else the AI made up is dropped.
            if (! isset($entries[$key])) {
                continue;
            }
            $text = mb_substr(trim(strip_tags((string) ($row['text'] ?? ''))), 0, $entries[$key]['max']);
            if ($text !== '') {
                $out[$key] = $text;
            }
        }

        return $out;
    }

    /** What the dashboard gets (no models, no Hindi helper text). */
    public static function present(array $entry): array
    {
        return array_intersect_key($entry, array_flip(['key', 'group', 'type', 'field', 'label', 'source', 'hi', 'value', 'max']));
    }

    private static function system(string $language): string
    {
        return <<<TXT
            You translate an Indian restaurant's or hotel's own website text from English into {$language}, for Indian guests reading the site in {$language}.
            - Dish names: keep them recognisable. Common Indian dish names (Paneer Tikka, Dal Makhani, Masala Dosa, Biryani) are written in {$language} script as they are said, not translated word by word. Translate plain words around them (Half, Full, Extra cheese, Starters) naturally.
            - Keep brand names, the business's name, numbers, prices, sizes and units exactly as they are.
            - Do not add or remove details. Never invent anything that is not in the English text.
            - Short and natural, the way a local menu or hotel site would say it. Same tone and length as the English.
            - The Hindi version, when given, is only there to help with meaning.
            - Return every key you were given exactly once.
            TXT;
    }

    /** A hint for the AI about what the text is ("dish name, in section Starters"). */
    private static function describe(array $e): string
    {
        $what = [
            'category.name' => 'menu section name',
            'item.name' => 'dish name',
            'item.description' => 'dish description',
            'variant.name' => 'size or portion of a dish',
            'group.name' => 'name of a group of add-ons',
            'addon.name' => 'add-on / extra',
            'room.name' => 'hotel room type name',
            'room.description' => 'hotel room description',
            'banner.title' => 'offer banner title',
            'banner.text' => 'offer banner text',
            'site.tagline' => 'website tagline',
            'site.about' => 'website "about us" text',
        ][$e['type'].'.'.$e['field']];

        return $e['label'] ? "{$what} ({$e['label']})" : $what;
    }

    /** @return array<string, array> */
    private function byKey(Tenant $tenant, User $user, string $lang): array
    {
        return collect($this->entries($tenant, $user, $lang))->keyBy('key')->all();
    }

    /**
     * The entries for these keys; any key that is not this business's own (or not editable by this person) fails.
     *
     * @return array<string, array>
     */
    private function known(Tenant $tenant, User $user, string $lang, array $keys): array
    {
        $entries = $this->byKey($tenant, $user, $lang);
        $unknown = array_values(array_diff($keys, array_keys($entries)));
        if ($unknown) {
            throw ValidationException::withMessages(['values' => 'Some of these texts no longer exist. Reload the page and try again.']);
        }

        return $entries;
    }

    /** Same check as the tenant.can middleware (a support session sees what the owner sees). */
    private function can(User $user, string $permission): bool
    {
        return $user->supportSession() !== null || $user->hasPermissionTo($permission);
    }
}
