<?php

namespace App\Modules\Reports\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The owner's daily summary, already written in their language (plain text, one fact per
 * line). Queued with plain values only: queue workers run without a tenant in context.
 */
class DailySummaryMessage extends Notification implements ShouldQueue
{
    use Queueable;

    /** @param  list<string>  $channels */
    public function __construct(
        public readonly string $text,
        public readonly string $subject,
        public readonly array $channels,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return $this->channels;
    }

    /** WhatsApp template variables can't hold new lines, so lines are joined with " | ". */
    public function toText(): string
    {
        return implode(' | ', explode("\n", $this->text));
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->subject);
        foreach (array_slice(explode("\n", $this->text), 1) as $line) {
            $mail->line($line);
        }

        return $mail;
    }
}
