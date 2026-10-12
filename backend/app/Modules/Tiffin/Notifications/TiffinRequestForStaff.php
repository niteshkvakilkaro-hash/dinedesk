<?php

namespace App\Modules\Tiffin\Notifications;

use App\Modules\Tiffin\Models\MealSubscription;
use Illuminate\Notifications\Notification;

/** Push alert: someone asked for a tiffin plan on the website. */
class TiffinRequestForStaff extends Notification
{
    public function __construct(public readonly MealSubscription $sub) {}

    public function via(object $notifiable): array
    {
        return ['webpush'];
    }

    public function toWebPush(object $notifiable): array
    {
        $s = $this->sub;

        return ['title' => "Tiffin request · {$s->name}", 'body' => ($s->plan?->name ?? 'Meal plan')." · from {$s->starts_on->format('j M')} · {$s->code()}", 'url' => '/dashboard/tiffin', 'tag' => "tiffin-{$s->id}"];
    }
}
