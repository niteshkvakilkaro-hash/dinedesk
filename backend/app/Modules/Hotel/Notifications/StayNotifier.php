<?php

namespace App\Modules\Hotel\Notifications;

use App\Models\User;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Hotel\Services\HotelSettings;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;

/** Guest messages about stays (on the business's message channels) and front-desk alerts. */
class StayNotifier
{
    public function __construct(
        private readonly OrderingSettings $ordering,
        private readonly HotelSettings $settings,
        private readonly TenantContext $context,
        private readonly SitePresenter $presenter,
    ) {}

    public function send(RoomBooking $b, string $kind, ?string $reason = null): void
    {
        $prefs = $this->ordering->get()['notifications'];
        $route = new AnonymousNotifiable();
        $channels = [];
        if ($prefs['email'] && $b->email) {
            $route->route('mail', $b->email);
            $channels[] = 'mail';
        }
        foreach (['whatsapp', 'sms'] as $c) {
            if ($prefs[$c]) {
                $route->route($c, $b->phone);
                $channels[] = $c;
            }
        }
        if (! $channels) {
            return;
        }
        $tenant = $this->context->require();
        $route->notify(new StayMessage([
            'code' => $b->code,
            'dates' => self::dates($b),
            'nights' => $b->nights,
            'checkin' => CarbonImmutable::createFromFormat('H:i', $this->settings->get()['check_in_time'])->format('g:i A'),
            'locale' => $b->locale,
            'reason' => $reason ? strip_tags($reason) : null,
        ], $kind, $tenant->name, self::manageUrl($this->presenter->primaryHost($tenant), $b), $channels));
    }

    /** Front-desk staff who handle rooms get an in-app alert. */
    public static function staff(Tenant $tenant, array $data): void
    {
        $staff = User::where('tenant_id', $tenant->id)->where('status', 'active')->get()
            ->filter(fn (User $u) => in_array('rooms.manage', $u->tenantPermissions(), true));
        Notification::send($staff, new HotelForStaff(['tenant_id' => $tenant->id] + $data));
    }

    /** "12 Nov – 14 Nov". */
    public static function dates(RoomBooking $b): string
    {
        return $b->check_in->format('j M').' – '.$b->check_out->format('j M Y');
    }

    public static function manageUrl(string $host, RoomBooking $b): string
    {
        $base = str_replace('{host}', $host, (string) config('dinedesk.site_url_pattern'));

        return rtrim($base, '/')."/stay/{$b->public_id}?t={$b->access_token}";
    }
}
