<?php

namespace App\Modules\Referrals\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * To the referrer's owner: a business that signed up with their link started paying, and
 * what happened to their free days. Already written in the owner's language (lang/<code>/
 * owner.php); queued with plain values only. Email when the owner has one, web push to
 * the devices where they turned alerts on.
 */
class ReferralRewardEarned extends Notification implements ShouldQueue
{
    use Queueable;

    /** @param  list<string>  $lines */
    public function __construct(
        public readonly string $subject,
        public readonly array $lines,
        public readonly string $url,
        public readonly string $linkLine,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return array_values(array_filter([$notifiable->email ? 'mail' : null, 'webpush']));
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject($this->subject);
        foreach ($this->lines as $line) {
            $mail->line($line);
        }

        return $mail->line($this->linkLine);
    }

    public function toWebPush(object $notifiable): array
    {
        return ['title' => $this->subject, 'body' => $this->lines[1] ?? $this->lines[0], 'url' => '/dashboard/billing', 'tag' => 'referral-reward'];
    }
}
