<?php

namespace App\Modules\Tiffin\Notifications;

use App\Support\Locale;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * One update to a tiffin subscriber (confirmed / declined / paused / resumed / cancelled), in
 * the subscriber's language. Plain values only (queued jobs run without a tenant in context).
 */
class TiffinMessage extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array{code: string, plan: ?string, from: ?string, until: ?string, locale: string}  $sub
     * @param  list<string>  $channels
     */
    public function __construct(
        public readonly array $sub,
        public readonly string $kind,
        public readonly string $business,
        public readonly array $channels,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** Texts live in lang/<code>/guest.php (tiffin.*). */
    public function toText(): string
    {
        $l = $this->guestLocale();

        return trans('guest.tiffin.'.$this->kind, [
            'business' => $this->business,
            'plan' => $this->sub['plan'] ?? trans('guest.tiffin.default_plan', [], $l),
            'code' => $this->sub['code'],
            'from' => $this->sub['from'] ?? '',
            'until' => $this->sub['until'] ?? '',
        ], $l);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $l = $this->guestLocale();

        return (new MailMessage)
            ->subject(trans('guest.tiffin.subject', ['business' => $this->business, 'code' => $this->sub['code']], $l))
            ->greeting(trans('guest.mail.greeting', [], $l))
            ->line($this->toText())
            ->salutation(trans('guest.mail.salutation', ['business' => $this->business], $l));
    }

    private function guestLocale(): string
    {
        return Locale::guest($this->sub['locale'] ?? null);
    }
}
