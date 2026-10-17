<?php

namespace App\Modules\Tiffin\Notifications;

use App\Modules\Notify\Support\FcmChannel;
use App\Modules\Notify\Support\StaffText;
use App\Modules\Tiffin\Models\MealSubscription;
use Illuminate\Notifications\Notification;

/** Push alert: someone asked for a tiffin plan on the website. */
class TiffinRequestForStaff extends Notification
{
    public function __construct(public readonly MealSubscription $sub) {}

    public function via(object $notifiable): array
    {
        return ['webpush', ...FcmChannel::for($notifiable)];
    }

    /** The same alert in the DineDesk Android app; rings like a new order (channel "orders"). */
    public function toFcm(object $notifiable): array
    {
        return $this->toWebPush($notifiable) + ['kind' => 'tiffin', 'channel' => 'orders'];
    }

    public function toWebPush(object $notifiable): array
    {
        $s = $this->sub;
        $t = StaffText::for($notifiable);

        return [
            'title' => $t('tiffin.title', ['name' => $s->name]),
            'body' => $t('tiffin.body', ['plan' => $s->plan?->name ?? $t('tiffin.default_plan'), 'date' => $t->date($s->starts_on->format('Y-m-d')), 'code' => $s->code()]),
            'url' => '/dashboard/tiffin',
            'tag' => "tiffin-{$s->id}",
        ];
    }
}
