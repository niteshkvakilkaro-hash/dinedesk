<?php

namespace App\Modules\Hotel\Notifications;

use App\Support\Locale;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * One guest update about a room booking, in the guest's language.
 * Plain values only (queued jobs run without a tenant in context).
 */
class StayMessage extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array{code: string, dates: string, nights: int, checkin: string, locale: string, reason: ?string}  $stay
     * @param  list<string>  $channels
     */
    public function __construct(
        public readonly array $stay,
        public readonly string $kind,
        public readonly string $business,
        public readonly string $url,
        public readonly array $channels,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** Texts live in lang/<code>/guest.php (stay.*). */
    public function toText(): string
    {
        $l = $this->guestLocale();
        $reason = $this->stay['reason'] ? ' '.trans('guest.reason', ['reason' => $this->stay['reason']], $l) : '';

        return trans('guest.stay.'.$this->kind, [
            'business' => $this->business,
            'dates' => $this->stay['dates'],
            'nights' => trans_choice('guest.stay.nights', (int) $this->stay['nights'], [], $l),
            'checkin' => $this->stay['checkin'],
            'code' => $this->stay['code'],
            'url' => $this->url,
            'reason' => $reason,
        ], $l);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $l = $this->guestLocale();

        return (new MailMessage)
            ->subject(trans('guest.stay.subject', ['business' => $this->business, 'code' => $this->stay['code']], $l))
            ->greeting(trans('guest.mail.greeting', [], $l))
            ->line($this->toText())
            ->action(trans('guest.stay.button', [], $l), $this->url)
            ->salutation(trans('guest.mail.salutation', ['business' => $this->business], $l));
    }

    private function guestLocale(): string
    {
        return Locale::guest($this->stay['locale'] ?? null);
    }
}
