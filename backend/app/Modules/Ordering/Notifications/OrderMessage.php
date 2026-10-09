<?php

namespace App\Modules\Ordering\Notifications;

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

    public const TEXTS = [
        'en' => [
            'placed' => ':business: we have received your order #:number (₹:total). Track it here: :url',
            'confirmed' => ':business has confirmed your order #:number. Track it: :url',
            'ready_takeaway' => 'Your order #:number from :business is ready for pickup.',
            'ready_dine_in' => 'Your order #:number from :business is ready.',
            'out_for_delivery' => 'Your order #:number from :business is out for delivery. Track it: :url',
            'completed' => 'Thank you for ordering from :business! Order #:number is complete.',
            'cancelled' => 'Sorry, :business had to cancel your order #:number. Reason: :reason',
        ],
        'hi' => [
            'placed' => ':business: आपका ऑर्डर #:number (₹:total) मिल गया है। यहाँ ट्रैक करें: :url',
            'confirmed' => ':business ने आपका ऑर्डर #:number कन्फ़र्म कर दिया है। ट्रैक करें: :url',
            'ready_takeaway' => ':business से आपका ऑर्डर #:number पिकअप के लिए तैयार है।',
            'ready_dine_in' => ':business से आपका ऑर्डर #:number तैयार है।',
            'out_for_delivery' => ':business से आपका ऑर्डर #:number डिलीवरी के लिए निकल चुका है। ट्रैक करें: :url',
            'completed' => ':business से ऑर्डर करने के लिए धन्यवाद! ऑर्डर #:number पूरा हुआ।',
            'cancelled' => 'माफ़ कीजिए, :business को आपका ऑर्डर #:number रद्द करना पड़ा। कारण: :reason',
        ],
    ];

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

    public function toText(): string
    {
        $texts = self::TEXTS[$this->order['locale']] ?? self::TEXTS['en'];

        return strtr($texts[$this->kind], [
            ':business' => $this->business,
            ':number' => (string) $this->order['number'],
            ':total' => $this->order['total'],
            ':url' => $this->trackUrl,
            ':reason' => (string) $this->order['cancel_reason'],
        ]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("{$this->business} — order #{$this->order['number']}")
            ->line($this->toText())
            ->action($this->order['locale'] === 'hi' ? 'ऑर्डर देखें' : 'View your order', $this->trackUrl);
    }
}
