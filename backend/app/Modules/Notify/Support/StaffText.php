<?php

namespace App\Modules\Notify\Support;

use App\Support\LocalDate;
use App\Support\Locale;
use DateTimeInterface;

/**
 * Staff alert texts (lang/<code>/staff.php) in the recipient's own dashboard language
 * (users.locale, English when unset or unsupported). One per notifiable, so a team with
 * different languages each get their own.
 */
final class StaffText
{
    public function __construct(public readonly string $locale) {}

    public static function for(object $notifiable): self
    {
        return new self(Locale::guest($notifiable->locale ?? null));
    }

    public function __invoke(string $key, array $replace = []): string
    {
        return trans("staff.{$key}", $replace, $this->locale);
    }

    /** "14 Nov" in the recipient's language (Western digits). */
    public function date(DateTimeInterface|string $date, string $format = 'D MMM', ?string $timezone = null): string
    {
        return LocalDate::format($date, $format, $this->locale, $timezone);
    }
}
