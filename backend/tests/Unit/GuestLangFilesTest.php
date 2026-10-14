<?php

namespace Tests\Unit;

use Illuminate\Support\Arr;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Every language's message files match English key for key and placeholder for placeholder:
 * lang/<code>/guest.php (messages to guests) and lang/<code>/owner.php (the owner's daily summary).
 */
class GuestLangFilesTest extends TestCase
{
    private const LANG = __DIR__.'/../../lang';

    public static function files(): array
    {
        return ['guest messages' => ['guest'], 'owner summary' => ['owner']];
    }

    #[DataProvider('files')]
    public function test_every_language_has_the_file(string $name): void
    {
        $codes = (require __DIR__.'/../../config/dinedesk.php')['languages'];
        $this->assertCount(12, $codes);
        foreach ($codes as $code) {
            $this->assertFileExists(self::LANG."/{$code}/{$name}.php", "Missing lang/{$code}/{$name}.php");
        }
    }

    #[DataProvider('files')]
    public function test_keys_and_placeholders_match_english(string $name): void
    {
        $en = Arr::dot(require self::LANG."/en/{$name}.php");
        foreach (glob(self::LANG."/*/{$name}.php") as $file) {
            $code = basename(dirname($file));
            $lines = Arr::dot(require $file);
            $this->assertEqualsCanonicalizing(array_keys($en), array_keys($lines), "lang/{$code}/{$name}.php keys differ from English");
            foreach ($en as $key => $text) {
                $this->assertNotSame('', trim($lines[$key]), "{$code}: {$key} is empty");
                $this->assertSame($this->placeholders($text), $this->placeholders($lines[$key]), "{$code}: placeholders differ in {$key}");
                // Western digits only (no Devanagari, Bengali, ... digits in the text).
                $this->assertDoesNotMatchRegularExpression('/[^\P{Nd}0-9]/u', $lines[$key], "{$code}: {$key} uses non-Western digits");
            }
        }
    }

    /** @return list<string> */
    private function placeholders(string $text): array
    {
        preg_match_all('/:([a-z_]+)/', $text, $m);
        $found = array_values(array_unique($m[1]));
        sort($found);

        return $found;
    }
}
