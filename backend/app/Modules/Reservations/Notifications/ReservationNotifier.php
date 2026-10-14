<?php

namespace App\Modules\Reservations\Notifications;

use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use App\Support\LocalDate;
use Illuminate\Notifications\AnonymousNotifiable;

/** Guest messages about bookings, on the channels the business chose (Ordering → notifications). */
class ReservationNotifier
{
    public function __construct(
        private readonly OrderingSettings $ordering,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function send(Reservation $r, string $kind, ?string $reason = null): void
    {
        $prefs = $this->ordering->get()['notifications'];
        $route = new AnonymousNotifiable;
        $channels = [];
        if ($prefs['email'] && $r->email) {
            $route->route('mail', $r->email);
            $channels[] = 'mail';
        }
        foreach (['whatsapp', 'sms'] as $c) {
            if ($prefs[$c]) {
                $route->route($c, $r->phone);
                $channels[] = $c;
            }
        }
        if (! $channels) {
            return;
        }
        $tenant = $this->context->require();
        $booking = [
            'code' => $r->code,
            'party' => $r->party_size,
            'when' => self::when($r, $tenant->timezone),
            'locale' => $r->locale,
            'reason' => $reason ? strip_tags($reason) : null,
        ];
        $route->notify(new ReservationMessage($booking, $kind, $tenant->name, self::manageUrl($this->presenter->primaryHost($tenant), $r), $channels));
    }

    /** "Sat 14 Nov, 7:30 PM" in the business's timezone and the guest's language. */
    public static function when(Reservation $r, string $timezone): string
    {
        return LocalDate::format($r->starts_at, 'ddd D MMM, h:mm A', $r->locale, $timezone);
    }

    public static function manageUrl(string $host, Reservation $r): string
    {
        $base = str_replace('{host}', $host, (string) config('dinedesk.site_url_pattern'));

        return rtrim($base, '/')."/reservation?code={$r->code}";
    }
}
