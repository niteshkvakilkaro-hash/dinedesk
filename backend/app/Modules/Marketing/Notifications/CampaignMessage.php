<?php

namespace App\Modules\Marketing\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/** One campaign message to one opted-in customer (plain values; queued). */
class CampaignMessage extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $text,
        public readonly string $business,
        public readonly string $unsubscribeUrl,
        public readonly string $channel,
        public readonly string $subject,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return [$this->channel];
    }

    public function toText(): string
    {
        return "{$this->business}: {$this->text}\n\nNo more offers: {$this->unsubscribeUrl}";
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->business} — {$this->subject}")
            ->line($this->text)
            ->line("You get this because you asked {$this->business} for offers. Stop: {$this->unsubscribeUrl}");
    }
}
