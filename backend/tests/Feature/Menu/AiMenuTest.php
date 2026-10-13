<?php

namespace Tests\Feature\Menu;

use App\Support\Ai\Ai;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/** AI menu import and dish descriptions, against a fake AI (no request leaves the machine). */
class AiMenuTest extends TestCase
{
    /** @var list<array{system: string, content: array}> */
    public array $calls = [];

    private function fakeAi(array $answer): void
    {
        $test = $this;
        $this->app->instance(Ai::class, new class($answer, $test) implements Ai {
            public function __construct(private array $answer, private AiMenuTest $test) {}

            public function enabled(): bool
            {
                return true;
            }

            public function json(string $system, array $content, array $schema, int $maxTokens = 16000): array
            {
                $this->test->calls[] = ['system' => $system, 'content' => $content, 'schema' => $schema];

                return $this->answer;
            }
        });
    }

    public function test_without_a_key_ai_is_off_and_says_so(): void
    {
        config(['dinedesk.ai.api_key' => null]);
        $this->actingAsUser($this->ownerOf($this->business()));
        $this->getJson('/api/v1/tenant/menu/ai')->assertOk()->assertJsonPath('data.enabled', false);
        $this->post('/api/v1/tenant/menu/ai/read', ['files' => [UploadedFile::fake()->image('menu.jpg', 600, 900)]], ['Accept' => 'application/json'])
            ->assertStatus(503)->assertJsonPath('meta.code', 'ai_not_configured');
    }

    public function test_menu_photos_become_rows_for_the_csv_import(): void
    {
        $this->fakeAi(['categories' => [
            ['name' => 'Starters', 'items' => [
                ['name' => 'Paneer Tikka', 'description' => null, 'price' => 280, 'food_type' => 'veg', 'variants' => []],
                ['name' => 'Chicken 65', 'description' => 'Spicy fried chicken', 'price' => null, 'food_type' => 'unknown', 'variants' => []],
            ]],
            ['name' => 'Main Course', 'items' => [
                ['name' => 'Dal Makhani', 'description' => null, 'price' => 180, 'food_type' => 'veg', 'variants' => [['name' => 'Half', 'price' => 180], ['name' => 'Full', 'price' => 320.5]]],
                ['name' => '  ', 'description' => null, 'price' => 10, 'food_type' => 'veg', 'variants' => []],
            ]],
        ], 'notes' => ['GST extra']]);
        $this->actingAsUser($this->ownerOf($this->business()));

        $res = $this->post('/api/v1/tenant/menu/ai/read', ['files' => [UploadedFile::fake()->image('menu.jpg', 3000, 4000)]], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame([
            ['category' => 'Starters', 'name' => 'Paneer Tikka', 'description' => '', 'price' => '280', 'food_type' => 'veg', 'variants' => ''],
            ['category' => 'Starters', 'name' => 'Chicken 65', 'description' => 'Spicy fried chicken', 'price' => '', 'food_type' => '', 'variants' => ''],
            ['category' => 'Main Course', 'name' => 'Dal Makhani', 'description' => '', 'price' => '', 'food_type' => 'veg', 'variants' => 'Half:180|Full:320.50'],
        ], $res->json('data.rows'));
        $this->assertSame(['GST extra'], $res->json('data.notes'));

        // The photo was shrunk to a JPEG and sent with the "never guess a price" instruction.
        $image = $this->calls[0]['content'][0];
        $this->assertSame(['image', 'image/jpeg'], [$image['type'], $image['source']['mediaType']]);
        [$w, $h] = getimagesizefromstring(base64_decode($image['source']['data']));
        $this->assertSame(2000, max($w, $h));
        $this->assertStringContainsString('never guess', $this->calls[0]['system']);
    }

    public function test_files_are_checked_and_staff_without_menu_rights_are_kept_out(): void
    {
        $this->fakeAi(['categories' => [], 'notes' => []]);
        $tenant = $this->business();
        $this->actingAsUser($this->ownerOf($tenant));
        $this->post('/api/v1/tenant/menu/ai/read', ['files' => [UploadedFile::fake()->create('menu.docx', 10)]], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/v1/tenant/menu/ai/read', ['files' => [UploadedFile::fake()->image('blank.png', 400, 400)]], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('meta.code', 'no_dishes');

        $this->actingAsUser($this->staff($tenant, 'waiter'));
        $this->getJson('/api/v1/tenant/menu/ai')->assertForbidden();
    }

    public function test_dish_descriptions_in_english_and_hindi(): void
    {
        $this->fakeAi(['description' => 'Cottage cheese cubes marinated in spiced yoghurt and grilled in a tandoor.', 'description_hi' => 'दही और मसालों में लिपटे पनीर के टुकड़े, तंदूर में सिके हुए।']);
        $this->actingAsUser($this->ownerOf($this->business()));
        $this->postJson('/api/v1/tenant/menu/ai/describe', ['name' => 'Paneer Tikka', 'category' => 'Starters', 'food_type' => 'veg'])
            ->assertOk()->assertJsonPath('data.description_hi', 'दही और मसालों में लिपटे पनीर के टुकड़े, तंदूर में सिके हुए।');
        $this->assertStringContainsString('Paneer Tikka (menu section: Starters), veg', $this->calls[0]['content'][0]['text']);
        $this->postJson('/api/v1/tenant/menu/ai/describe', ['name' => 'X', 'food_type' => 'meat'])->assertStatus(422);
    }
}
