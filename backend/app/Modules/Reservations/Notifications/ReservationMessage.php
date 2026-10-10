<?php

namespace App\Modules\Reservations\Notifications;

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

    public const TEXTS = [
        'en' => [
            'received' => ':business: we have received your table request for :party on :when. Booking ID :code. We will confirm it soon: :url',
            'confirmed' => ':business: your table for :party on :when is confirmed. Booking ID :code. Manage it here: :url',
            'rejected' => 'Sorry, :business cannot take your booking for :when (booking ID :code).:reason',
            'cancelled' => 'Your booking at :business for :when (booking ID :code) has been cancelled.:reason',
            'reminder' => 'Reminder: your table at :business for :party is booked for :when. Booking ID :code. Need to cancel? :url',
        ],
        'hi' => [
            'received' => ':business: :when के लिए :party की टेबल का आपका अनुरोध मिल गया है। बुकिंग ID :code। हम जल्द कन्फ़र्म करेंगे: :url',
            'confirmed' => ':business: :when के लिए :party की आपकी टेबल कन्फ़र्म है। बुकिंग ID :code। यहाँ देखें: :url',
            'rejected' => 'माफ़ कीजिए, :business :when की आपकी बुकिंग (ID :code) नहीं ले सकता।:reason',
            'cancelled' => ':business में :when की आपकी बुकिंग (ID :code) रद्द हो गई है।:reason',
            'reminder' => 'याद दिला दें: :business में :party के लिए आपकी टेबल :when बुक है। बुकिंग ID :code। रद्द करनी है? :url',
        ],
    ];

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

    public function toText(): string
    {
        $hi = $this->booking['locale'] === 'hi';
        $texts = self::TEXTS[$hi ? 'hi' : 'en'];
        $party = $hi ? "{$this->booking['party']} लोगों" : ($this->booking['party'] === 1 ? '1 guest' : "{$this->booking['party']} guests");
        $reason = $this->booking['reason'] ? ($hi ? ' कारण: ' : ' Reason: ').$this->booking['reason'] : '';

        return strtr($texts[$this->kind], [
            ':business' => $this->business,
            ':party' => $party,
            ':when' => $this->booking['when'],
            ':code' => $this->booking['code'],
            ':url' => $this->url,
            ':reason' => $reason,
        ]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->business} — booking {$this->booking['code']}")
            ->line($this->toText())
            ->action($this->booking['locale'] === 'hi' ? 'बुकिंग देखें' : 'View your booking', $this->url);
    }
}
