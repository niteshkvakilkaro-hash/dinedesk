<?php

namespace App\Modules\Ordering\Notifications;

use App\Modules\Ordering\Models\Order;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use Illuminate\Notifications\AnonymousNotifiable;

/**
 * Decides which customer updates go out and on which channels (the business
 * chooses email / WhatsApp / SMS in Ordering settings).
 */
class CustomerNotifier
{
    public function __construct(
        private readonly OrderingSettings $settings,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function placed(Order $order): void
    {
        $this->send($order, 'placed');
    }

    public function statusChanged(Order $order): void
    {
        $kind = match ($order->status) {
            'confirmed' => 'confirmed',
            'ready' => in_array($order->type, ['delivery', 'room_service'], true) ? null : 'ready_'.$order->type,
            'out_for_delivery' => 'out_for_delivery',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
            default => null, // "preparing" shows on the tracking page only
        };
        if ($kind) {
            $this->send($order, $kind);
        }
    }

    public static function trackUrl(string $host, Order $order): string
    {
        $base = str_replace('{host}', $host, (string) config('dinedesk.site_url_pattern'));

        return rtrim($base, '/')."/order/{$order->public_id}?t={$order->tracking_token}";
    }

    private function send(Order $order, string $kind): void
    {
        $prefs = $this->settings->get()['notifications'];
        $route = new AnonymousNotifiable();
        $channels = [];
        if ($prefs['email'] && $order->customer_email) {
            $route->route('mail', $order->customer_email);
            $channels[] = 'mail';
        }
        foreach (['whatsapp', 'sms'] as $c) {
            if ($prefs[$c] && $order->customer_phone) {
                $route->route($c, $order->customer_phone);
                $channels[] = $c;
            }
        }
        if (! $channels) {
            return;
        }
        $tenant = $this->context->require();
        $snapshot = ['number' => $order->number, 'total' => (string) $order->total, 'locale' => $order->locale, 'cancel_reason' => $order->cancel_reason];
        $route->notify(new OrderMessage($snapshot, $kind, $tenant->name, self::trackUrl($this->presenter->primaryHost($tenant), $order), $channels));
    }
}
