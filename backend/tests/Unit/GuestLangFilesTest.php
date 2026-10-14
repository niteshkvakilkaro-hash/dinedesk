<?php

namespace Tests\Unit;

use Illuminate\Support\Arr;
use PHPUnit\Framework\TestCase;

/** Every language's guest messages (lang/<code>/guest.php) match English key for key and placeholder for placeholder. */
class GuestLangFilesTest extends TestCase
{
    private const LANG = __DIR__.'/../../lang';

    public function test_every_language_has_a_guest_file(): void
    {
        $codes = (require __DIR__.'/../../config/dinedesk.php')['languages'];
        $this->assertCount(12, $codes);
        foreach ($codes as $code) {
            $this->assertFileExists(self::LANG."/{$code}/guest.php", "Missing lang/{$code}/guest.php");
        }
    }

    public function test_keys_and_placeholders_match_english(): void
    {
        $en = Arr::dot(require self::LANG.'/en/guest.php');
        foreach (glob(self::LANG.'/*/guest.php') as $file) {
            $code = basename(dirname($file));
            $lines = Arr::dot(require $file);
            $this->assertEqualsCanonicalizing(array_keys($en), array_keys($lines), "lang/{$code}/guest.php keys differ from English");
            foreach ($en as $key => $text) {
                $this->assertNotSame('', trim($lines[$key]), "{$code}: {$key} is empty");
                $this->assertSame($this->placeholders($text), $this->placeholders($lines[$key]), "{$code}: placeholders differ in {$key}");
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
