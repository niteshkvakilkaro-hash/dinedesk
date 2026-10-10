<?php

namespace App\Modules\Hotel\Notifications;

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

    public const TEXTS = [
        'en' => [
            'received' => ':business: we have received your room request for :dates (:nights). Booking ID :code. We will confirm it soon: :url',
            'confirmed' => ':business: your room for :dates (:nights) is confirmed. Booking ID :code. Check-in from :checkin. Details: :url',
            'cancelled' => 'Your room booking at :business for :dates (booking ID :code) has been cancelled.:reason',
        ],
        'hi' => [
            'received' => ':business: :dates (:nights) के लिए आपका कमरे का अनुरोध मिल गया है। बुकिंग ID :code। हम जल्द कन्फ़र्म करेंगे: :url',
            'confirmed' => ':business: :dates (:nights) के लिए आपका कमरा कन्फ़र्म है। बुकिंग ID :code। चेक-इन :checkin से। विवरण: :url',
            'cancelled' => ':business में :dates की आपकी कमरा बुकिंग (ID :code) रद्द हो गई है।:reason',
        ],
    ];

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

    public function toText(): string
    {
        $hi = $this->stay['locale'] === 'hi';
        $n = $this->stay['nights'];
        $nights = $hi ? "{$n} रात" : ($n === 1 ? '1 night' : "{$n} nights");
        $reason = $this->stay['reason'] ? ($hi ? ' कारण: ' : ' Reason: ').$this->stay['reason'] : '';

        return strtr(self::TEXTS[$hi ? 'hi' : 'en'][$this->kind], [
            ':business' => $this->business,
            ':dates' => $this->stay['dates'],
            ':nights' => $nights,
            ':checkin' => $this->stay['checkin'],
            ':code' => $this->stay['code'],
            ':url' => $this->url,
            ':reason' => $reason,
        ]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->business} — room booking {$this->stay['code']}")
            ->line($this->toText())
            ->action($this->stay['locale'] === 'hi' ? 'बुकिंग देखें' : 'View your booking', $this->url);
    }
}
