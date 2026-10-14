<?php

namespace App\Modules\Reservations\Notifications;

use App\Support\Locale;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * One guest update about a table booking, in the guest's language.
 * Plain values only (queued jobs run without a tenant in context).
 */
class ReservationMessage extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array{code: string, party: int, when: string, locale: string, reason: ?string}  $booking
     * @param  list<string>  $channels
     */
    public function __construct(
        public readonly array $booking,
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

    /** Texts live in lang/<code>/guest.php (reservation.*). */
    public function toText(): string
    {
        $l = $this->guestLocale();
        $reason = $this->booking['reason'] ? ' '.trans('guest.reason', ['reason' => $this->booking['reason']], $l) : '';

        return trans('guest.reservation.'.$this->kind, [
            'business' => $this->business,
            'party' => trans_choice('guest.reservation.party', (int) $this->booking['party'], [], $l),
            'when' => $this->booking['when'],
            'code' => $this->booking['code'],
            'url' => $this->url,
            'reason' => $reason,
        ], $l);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $l = $this->guestLocale();

        return (new MailMessage)
            ->subject(trans('guest.reservation.subject', ['business' => $this->business, 'code' => $this->booking['code']], $l))
            ->greeting(trans('guest.mail.greeting', [], $l))
            ->line($this->toText())
            ->action(trans('guest.reservation.button', [], $l), $this->url)
            ->salutation(trans('guest.mail.salutation', ['business' => $this->business], $l));
    }

    private function guestLocale(): string
    {
        return Locale::guest($this->booking['locale'] ?? null);
    }
}
