<?php

namespace Tests\Unit;

use App\Support\LocalDate;
use Tests\TestCase;

/** Message dates in the recipient's language, always with Western digits. */
class LocalDateTest extends TestCase
{
    public function test_dates_are_written_in_each_language_with_western_digits(): void
    {
        $at = '2026-11-28 18:45:00'; // UTC → 12:15 AM next day in India
        foreach (config('dinedesk.languages') as $code) {
            $text = LocalDate::format($at, 'dddd D MMMM YYYY, h:mm A', $code, 'Asia/Kolkata');
            $this->assertStringContainsString('29', $text, $code);
            $this->assertStringContainsString('2026', $text, $code);
            $this->assertStringContainsString('12:15', $text, $code);
            $this->assertDoesNotMatchRegularExpression('/[\x{0660}-\x{0669}\x{06F0}-\x{06F9}\x{0966}-\x{096F}\x{09E6}-\x{09EF}\x{0A66}-\x{0A6F}\x{0AE6}-\x{0AEF}\x{0B66}-\x{0B6F}\x{0BE6}-\x{0BEF}\x{0C66}-\x{0C6F}\x{0CE6}-\x{0CEF}\x{0D66}-\x{0D6F}]/u', $text, $code);
            $this->assertStringNotContainsString('  ', $text, $code);
        }
    }

    public function test_hindi_tamil_and_odia(): void
    {
        $this->assertSame('Wed 11 Nov, 7:00 PM', LocalDate::format('2026-11-11 19:00', 'ddd D MMM, h:mm A', 'en'));
        $this->assertSame('बुध 11 नव., 7:00 शाम', LocalDate::format('2026-11-11 19:00', 'ddd D MMM, h:mm A', 'hi'));
        $this->assertSame('புதன் 11 நவம்பர், 7:00 மாலை', LocalDate::format('2026-11-11 19:00', 'ddd D MMM, h:mm A', 'ta'));
        // Carbon ships Odia month and weekday names; its AM/PM marker stays "PM".
        $this->assertSame('ବୁଧ 11 ନଭେମ୍ବର, 7:00 PM', LocalDate::format('2026-11-11 19:00', 'ddd D MMM, h:mm A', 'or'));
        $this->assertSame('Wed 11 Nov, 7:00 PM', LocalDate::format('2026-11-11 19:00', 'ddd D MMM, h:mm A', 'xx'));
    }

    public function test_native_digits_are_converted_to_western(): void
    {
        $this->assertSame('12 नव. 2026', LocalDate::westernDigits('१२ नव. २०२६'));
        $this->assertSame('3 মে 09', LocalDate::westernDigits('৩ মে ০৯'));
        $this->assertSame('7 7', LocalDate::westernDigits('٧ ۷'));
    }
}
