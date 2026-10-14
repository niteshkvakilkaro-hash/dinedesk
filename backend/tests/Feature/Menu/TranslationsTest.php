<?php

namespace Tests\Feature\Menu;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Hotel\Models\Room;
use App\Modules\Hotel\Models\RoomType;
use App\Modules\Marketing\Models\Banner;
use App\Modules\Menu\Models\Addon;
use App\Modules\Menu\Models\AddonGroup;
use App\Modules\Menu\Models\ItemVariant;
use App\Modules\Menu\Models\MenuCategory;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Plans\Models\Plan;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SiteContent;
use App\Support\Ai\Ai;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Dashboard → Menu → Languages: owner content in the other site languages, AI drafts (fake AI), public payloads. */
class TranslationsTest extends TestCase
{
    /** @var list<array{system: string, content: array}> */
    public array $calls = [];

    private Tenant $tenant;

    /** @var array<string, int> */
    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = $this->business('Haveli', 'pro', ['status' => 'live']);
        app(TenantContext::class)->run($this->tenant, function () {
            $starters = MenuCategory::create(['name' => 'Starters', 'name_hi' => 'स्टार्टर', 'slug' => 'starters', 'sort_order' => 1, 'is_active' => true]);
            $mains = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'sort_order' => 2, 'is_active' => true]);
            $tikka = MenuItem::create(['menu_category_id' => $starters->id, 'name' => 'Paneer Tikka', 'name_hi' => 'पनीर टिक्का', 'description' => 'Grilled cottage cheese', 'price' => 280, 'food_type' => 'veg', 'is_available' => true,
                'translations' => ['ta' => ['name' => 'பனீர் டிக்கா']]]);
            $dal = MenuItem::create(['menu_category_id' => $mains->id, 'name' => 'Dal Makhani', 'description' => '', 'price' => 220, 'food_type' => 'veg', 'is_available' => true]);
            $half = ItemVariant::create(['menu_item_id' => $dal->id, 'name' => 'Half', 'price' => 220, 'is_available' => true]);
            $group = AddonGroup::create(['name' => 'Extras', 'min_select' => 0, 'max_select' => 2]);
            $butter = Addon::create(['addon_group_id' => $group->id, 'name' => 'Extra butter', 'price' => 20, 'food_type' => 'veg', 'is_available' => true]);
            $tikka->addonGroups()->attach($group->id, ['tenant_id' => $this->tenant->id, 'sort_order' => 0]);
            $room = RoomType::create(['slug' => 'deluxe', 'name' => 'Deluxe', 'description' => 'Garden view room', 'base_occupancy' => 2, 'max_adults' => 2, 'max_children' => 0, 'base_price' => 3000]);
            Room::create(['room_type_id' => $room->id, 'number' => '101', 'qr_token' => Str::random(32)]);
            $banner = Banner::create(['placement' => 'offer', 'title' => 'Diwali offer', 'text' => '10% off', 'is_active' => true]);
            $content = app(SiteContent::class);
            $content->save(['tagline' => 'Royal food since 1990', 'about' => null, 'milestones' => [
                ['year' => '1990', 'title' => 'First kitchen', 'text' => 'A small dhaba'],
                ['year' => '2010', 'title' => 'New hall'],
            ]] + SiteContent::empty());
            $this->ids = ['starters' => $starters->id, 'mains' => $mains->id, 'tikka' => $tikka->id, 'dal' => $dal->id, 'half' => $half->id, 'group' => $group->id, 'butter' => $butter->id, 'room' => $room->id, 'banner' => $banner->id];
        });
    }

    private function fakeAi(array $answer): void
    {
        $test = $this;
        $this->app->instance(Ai::class, new class($answer, $test) implements Ai
        {
            public function __construct(private array $answer, private TranslationsTest $test) {}

            public function enabled(): bool
            {
                return true;
            }

            public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array
            {
                $this->test->calls[] = ['system' => $system, 'content' => $content];

                return $this->answer;
            }
        });
    }

    private function key(string $type, string $id, string $field): string
    {
        return "{$type}:{$this->ids[$id]}:{$field}";
    }

    public function test_lists_everything_in_menu_order_with_current_values(): void
    {
        $this->actingAsUser($this->ownerOf($this->tenant));
        $entries = $this->getJson('/api/v1/tenant/translations?lang=ta')->assertOk()->json('data.entries');

        $this->assertSame([
            $this->key('category', 'starters', 'name'),
            $this->key('item', 'tikka', 'name'),
            $this->key('item', 'tikka', 'description'),
            $this->key('category', 'mains', 'name'),
            $this->key('item', 'dal', 'name'), // no description: nothing to translate
            $this->key('variant', 'half', 'name'),
            $this->key('group', 'group', 'name'),
            $this->key('addon', 'butter', 'name'),
            $this->key('room', 'room', 'name'),
            $this->key('room', 'room', 'description'),
            $this->key('banner', 'banner', 'title'),
            $this->key('banner', 'banner', 'text'),
            'site:0:tagline', // about is empty
            'milestone:0:title',
            'milestone:0:text',
            'milestone:1:title', // no text
        ], array_column($entries, 'key'));
        $this->assertSame(['1990', 'First kitchen', 80], [$entries[13]['label'], $entries[13]['source'], $entries[13]['max']]);

        $tikka = $entries[1];
        $this->assertSame(['menu', 'Starters', 'Paneer Tikka', 'பனீர் டிக்கா', 'पनीर टिक्का', 150], [$tikka['group'], $tikka['label'], $tikka['source'], $tikka['value'], $tikka['hi'], $tikka['max']]);
        $this->assertSame('', $entries[2]['value']);
        $this->assertSame(['rooms', 'banners', 'website'], [$entries[8]['group'], $entries[10]['group'], $entries[12]['group']]);

        // English and Hindi are edited in the normal editors, not here.
        $this->getJson('/api/v1/tenant/translations?lang=hi')->assertStatus(422);
        $this->getJson('/api/v1/tenant/translations?lang=en')->assertStatus(422);
        $this->getJson('/api/v1/tenant/translations?lang=xx')->assertStatus(422);

        // Staff without menu rights are kept out.
        $this->actingAsUser($this->staff($this->tenant, 'waiter'));
        $this->getJson('/api/v1/tenant/translations?lang=ta')->assertForbidden();
    }

    public function test_saves_and_clears_translations_and_the_site_shows_them(): void
    {
        $this->actingAsUser($this->ownerOf($this->tenant));
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => [
            $this->key('item', 'tikka', 'name') => '', // cleared
            $this->key('item', 'tikka', 'description') => ' வறுத்த பனீர் ',
            $this->key('variant', 'half', 'name') => 'அரை',
            $this->key('addon', 'butter', 'name') => 'கூடுதல் வெண்ணெய்',
            $this->key('room', 'room', 'name') => 'டீலக்ஸ்',
            $this->key('banner', 'banner', 'title') => 'தீபாவளி சலுகை',
            'site:0:tagline' => 'அரச உணவு',
        ]])->assertOk()->assertJsonPath('data.entries.2.value', 'வறுத்த பனீர்');

        app(TenantContext::class)->run($this->tenant, function () {
            $tikka = MenuItem::find($this->ids['tikka']);
            $this->assertSame(['ta' => ['description' => 'வறுத்த பனீர்']], $tikka->translations);
            $this->assertSame('पनीर टिक्का', $tikka->name_hi); // Hindi untouched
        });
        $log = AuditLog::where('tenant_id', $this->tenant->id)->where('action', 'menu.translations_saved')->sole();
        $this->assertSame(['lang' => 'ta', 'texts' => 7], $log->meta);

        // Saving the website form keeps the translations.
        $this->putJson('/api/v1/tenant/website/content', ['tagline' => 'Royal food since 1990', 'about' => 'Family run.'] + array_diff_key(SiteContent::empty(), ['translations' => 1]))->assertOk();

        $host = ['X-Tenant-Host' => $this->host($this->tenant)];
        $menu = $this->getJson('/api/v1/site/menu', $host)->assertOk();
        $menu->assertJsonPath('data.0.items.0.translations.ta.description', 'வறுத்த பனீர்')
            ->assertJsonPath('data.0.items.0.addon_groups.0.addons.0.translations.ta.name', 'கூடுதல் வெண்ணெய்')
            ->assertJsonPath('data.1.items.0.variants.0.translations.ta.name', 'அரை');
        $this->assertNull($menu->json('data.0.items.0.translations.ta.name'));
        $this->assertSame([], $menu->json('data.0.translations'));
        $site = $this->getJson('/api/v1/site', $host)->assertOk()
            ->assertJsonPath('data.content.translations.ta.tagline', 'அரச உணவு')
            ->assertJsonPath('data.growth.banners.0.translations.ta.title', 'தீபாவளி சலுகை');
        $this->assertSame('Family run.', $site->json('data.content.about'));
        $this->getJson('/api/v1/site/hotel', $host)->assertOk()->assertJsonPath('data.types.0.translations.ta.name', 'டீலக்ஸ்');

        // Clearing the tagline removes it.
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => ['site:0:tagline' => '']])->assertOk();
        $this->assertSame([], $this->getJson('/api/v1/site', $host)->json('data.content.translations'));
    }

    public function test_milestones_and_search_description_follow_their_texts(): void
    {
        $this->actingAsUser($this->ownerOf($this->tenant));
        $form = fn () => $this->getJson('/api/v1/tenant/website')->assertOk()->json('data.content');
        $base = $form();
        $this->putJson('/api/v1/tenant/website/content', ['seo' => ['description' => 'Royal thalis in Jaipur', 'description_hi' => null]] + $base)->assertOk();

        $entries = $this->getJson('/api/v1/tenant/translations?lang=ta')->assertOk()->json('data.entries');
        $this->assertSame(['site:0:tagline', 'milestone:0:title', 'milestone:0:text', 'milestone:1:title', 'seo:0:description'], array_values(array_slice(array_column($entries, 'key'), -5)));
        $this->assertSame([160, 'website'], [end($entries)['max'], end($entries)['group']]);

        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => [
            'milestone:0:title' => 'முதல் சமையலறை',
            'milestone:1:title' => 'புதிய அரங்கம்',
            'seo:0:description' => 'ஜெய்ப்பூரில் அரச தாலி',
        ]])->assertOk();
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'bn', 'values' => ['milestone:1:title' => 'নতুন হল']])->assertOk();

        // The owner removes the first milestone and saves the form as loaded: the second keeps its texts.
        $content = $form();
        $this->assertSame(['ta' => ['title' => 'புதிய அரங்கம்'], 'bn' => ['title' => 'নতুন হল']], $content['milestones'][1]['translations']);
        $content['milestones'] = [$content['milestones'][1], ['year' => '2020', 'title' => 'Rooftop']];
        $this->putJson('/api/v1/tenant/website/content', $content)->assertOk();

        $host = ['X-Tenant-Host' => $this->host($this->tenant)];
        $site = $this->getJson('/api/v1/site', $host)->assertOk();
        $site->assertJsonPath('data.content.milestones.0.title', 'New hall')
            ->assertJsonPath('data.content.milestones.0.translations.ta.title', 'புதிய அரங்கம்')
            ->assertJsonPath('data.content.milestones.0.translations.bn.title', 'নতুন হল')
            ->assertJsonPath('data.content.seo.translations.ta.description', 'ஜெய்ப்பூரில் அரச தாலி')
            ->assertJsonPath('data.seo.description', 'Royal thalis in Jaipur')
            ->assertJsonPath('data.seo.translations.ta.description', 'ஜெய்ப்பூரில் அரச தாலி');
        $this->assertSame([], $site->json('data.content.milestones.1.translations'));
        $this->assertSame('milestone:0:title', $this->getJson('/api/v1/tenant/translations?lang=ta')->json('data.entries.13.key'));
        $this->assertSame('புதிய அரங்கம்', $this->getJson('/api/v1/tenant/translations?lang=ta')->json('data.entries.13.value'));

        // Without its own description the site describes itself with the tagline, in each language too.
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => ['site:0:tagline' => 'அரச உணவு']])->assertOk();
        $content = $form();
        $content['seo']['description'] = null;
        $this->putJson('/api/v1/tenant/website/content', $content)->assertOk();
        $this->getJson('/api/v1/site', $host)->assertJsonPath('data.seo.description', 'Royal food since 1990')
            ->assertJsonPath('data.seo.translations.ta.description', 'அரச உணவு');
    }

    public function test_keys_must_be_this_business_and_within_length(): void
    {
        $other = $this->business('Other Cafe');
        $foreign = app(TenantContext::class)->run($other, function () {
            $c = MenuCategory::create(['name' => 'Snacks', 'slug' => 'snacks', 'is_active' => true]);

            return MenuItem::create(['menu_category_id' => $c->id, 'name' => 'Samosa', 'price' => 20, 'food_type' => 'veg'])->id;
        });

        $this->actingAsUser($this->ownerOf($this->tenant));
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => ["item:{$foreign}:name" => 'சமோசா']])
            ->assertStatus(422)->assertJsonValidationErrors('values');
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'ta', 'values' => [$this->key('variant', 'half', 'name') => str_repeat('அ', 61)]])
            ->assertStatus(422);
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'hi', 'values' => [$this->key('variant', 'half', 'name') => 'आधा']])->assertStatus(422);
        app(TenantContext::class)->run($other, fn () => $this->assertNull(MenuItem::find($foreign)->translations));
        $this->postJson('/api/v1/tenant/translations/ai', ['lang' => 'ta', 'keys' => ["item:{$foreign}:name"]])->assertStatus(422);
    }

    public function test_ai_drafts_only_the_asked_keys_and_saves_nothing(): void
    {
        $name = $this->key('item', 'tikka', 'name');
        $desc = $this->key('item', 'tikka', 'description');
        $this->fakeAi(['translations' => [
            ['key' => $name, 'text' => 'பனீர் டிக்கா'],
            ['key' => $desc, 'text' => ' <b>வறுத்த</b> பனீர் '],
            ['key' => $this->key('category', 'mains', 'name'), 'text' => 'not asked for'],
            ['key' => 'item:99999:name', 'text' => 'made up'],
        ]]);
        $this->actingAsUser($this->ownerOf($this->tenant));

        $this->postJson('/api/v1/tenant/translations/ai', ['lang' => 'ml', 'keys' => [$name, $desc, 'item:99999:name']])
            ->assertOk()->assertExactJson(['data' => ['suggestions' => [$name => 'பனீர் டிக்கா', $desc => 'வறுத்த பனீர்']], 'message' => null, 'errors' => null, 'meta' => null]);

        $this->assertCount(1, $this->calls);
        $this->assertStringContainsString('into Malayalam', $this->calls[0]['system']);
        $this->assertStringContainsString('Paneer Tikka', $this->calls[0]['content'][0]['text']);
        $this->assertStringContainsString('पनीर टिक्का', $this->calls[0]['content'][0]['text']); // Hindi as context
        $this->assertStringNotContainsString('Mains', $this->calls[0]['content'][0]['text']);
        app(TenantContext::class)->run($this->tenant, fn () => $this->assertSame(['ta' => ['name' => 'பனீர் டிக்கா']], MenuItem::find($this->ids['tikka'])->translations));

        $this->postJson('/api/v1/tenant/translations/ai', ['lang' => 'ml', 'keys' => array_fill(0, 121, $name)])->assertStatus(422);
    }

    public function test_without_a_key_ai_is_off(): void
    {
        config(['dinedesk.ai.api_key' => null]);
        $this->actingAsUser($this->ownerOf($this->tenant));
        $this->postJson('/api/v1/tenant/translations/ai', ['lang' => 'ta', 'keys' => [$this->key('item', 'tikka', 'name')]])
            ->assertStatus(503)->assertJsonPath('meta.code', 'ai_not_configured');
    }

    public function test_rooms_offers_and_website_only_for_those_who_may_edit_them(): void
    {
        // A Growth plan has no hotel module.
        $this->tenant->update(['plan_id' => Plan::where('code', 'growth')->value('id')]);
        $this->actingAsUser($this->ownerOf($this->tenant));
        $groups = array_unique(array_column($this->getJson('/api/v1/tenant/translations?lang=bn')->assertOk()->json('data.entries'), 'group'));
        $this->assertSame(['menu', 'banners', 'website'], array_values($groups));
        $this->putJson('/api/v1/tenant/translations', ['lang' => 'bn', 'values' => [$this->key('room', 'room', 'name') => 'ডিলাক্স']])->assertStatus(422);
    }
}
