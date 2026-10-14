<?php

namespace App\Modules\Tiffin\Notifications;

use App\Modules\Ordering\Models\Customer;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tiffin\Models\MealSubscription;
use App\Support\LocalDate;
use Illuminate\Notifications\AnonymousNotifiable;

/** Messages to tiffin subscribers when staff change their subscription, on the business's message channels (Ordering → notifications). */
class TiffinNotifier
{
    public const KINDS = ['confirmed', 'declined', 'paused', 'resumed', 'cancelled'];

    public function __construct(
        private readonly OrderingSettings $ordering,
        private readonly TenantContext $context,
    ) {}

    public function send(MealSubscription $s, string $kind): void
    {
        $prefs = $this->ordering->get()['notifications'];
        $route = new AnonymousNotifiable();
        $channels = [];
        $email = $s->customer_id ? Customer::whereKey($s->customer_id)->value('email') : null;
        if ($prefs['email'] && $email) {
            $route->route('mail', $email);
            $channels[] = 'mail';
        }
        foreach (['whatsapp', 'sms'] as $c) {
            if ($prefs[$c] && $s->phone) {
                $route->route($c, $s->phone);
                $channels[] = $c;
            }
        }
        if (! $channels) {
            return;
        }
        $date = fn ($d) => $d ? LocalDate::format($d, 'D MMM YYYY', $s->locale) : null;
        $route->notify(new TiffinMessage([
            'code' => $s->code(),
            'plan' => $s->plan?->name,
            'from' => $date($s->starts_on),
            'until' => $date($s->ends_on),
            'locale' => $s->locale ?? 'en',
        ], $kind, $this->context->require()->name, $channels));
    }
}
