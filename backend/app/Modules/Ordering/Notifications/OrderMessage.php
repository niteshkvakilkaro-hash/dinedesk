<?php

namespace App\Modules\Ordering\Notifications;

use App\Support\Locale;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * One customer update (order received / confirmed / ready ...) in the order's language.
 * Carries plain values, not the Order model: queued jobs run without a tenant in
 * context, and tenant-scoped models deliberately can't be loaded there.
 */
class OrderMessage extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array{number: int, total: string, locale: string, cancel_reason: ?string}  $order
     * @param  list<string>  $channels
     */
    public function __construct(
        public readonly array $order,
        public readonly string $kind,
        public readonly string $business,
        public readonly string $trackUrl,
        public readonly array $channels,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** Texts live in lang/<code>/guest.php (order.*). */
    public function toText(): string
    {
        return trans('guest.order.'.$this->kind, [
            'business' => $this->business,
            'number' => (string) $this->order['number'],
            'total' => $this->order['total'],
            'url' => $this->trackUrl,
            'reason' => (string) $this->order['cancel_reason'],
        ], $this->guestLocale());
    }

    public function toMail(object $notifiable): MailMessage
    {
        $l = $this->guestLocale();

        return (new MailMessage)
            ->subject(trans('guest.order.subject', ['business' => $this->business, 'number' => (string) $this->order['number']], $l))
            ->greeting(trans('guest.mail.greeting', [], $l))
            ->line($this->toText())
            ->action(trans('guest.order.button', [], $l), $this->trackUrl)
            ->salutation(trans('guest.mail.salutation', ['business' => $this->business], $l));
    }

    private function guestLocale(): string
    {
        return Locale::guest($this->order['locale'] ?? null);
    }
}
