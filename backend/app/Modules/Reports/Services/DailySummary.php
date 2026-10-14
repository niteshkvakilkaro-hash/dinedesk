<?php

namespace App\Modules\Reports\Services;

use App\Models\User;
use App\Modules\Hotel\Models\RoomBooking;
use App\Modules\Identity\Support\Roles;
use App\Modules\Inventory\Models\InventoryItem;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Reports\Notifications\DailySummaryMessage;
use App\Modules\Reservations\Models\Reservation;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\Locale;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Str;

/**
 * The owner's morning summary of yesterday (WhatsApp and/or email), in the owner's own
 * dashboard language. Every number comes from the same calculation as the Reports page
 * (Analytics::overview for that one day); modules the business doesn't use are left out.
 * Runs in the tenant's context.
 */
class DailySummary
{
    public const KEY = 'daily_summary';

    /** The local date the summary last went out (so an hourly run never sends twice). */
    public const SENT_KEY = 'daily_summary_sent_on';

    /** Hours (business-local) the owner can choose. */
    public const HOURS = [7, 8, 9, 10, 11];

    public function __construct(
        private readonly TenantSettings $settings,
        private readonly Analytics $analytics,
        private readonly FeatureService $features,
    ) {}

    public static function defaults(): array
    {
        // Off until the owner switches it on: WhatsApp messages cost money.
        return ['enabled' => false, 'whatsapp' => true, 'email' => false, 'hour' => 9];
    }

    public static function rules(): array
    {
        return [
            'enabled' => ['required', 'boolean'],
            'whatsapp' => ['required', 'boolean'],
            'email' => ['required', 'boolean'],
            'hour' => ['required', 'integer', 'in:'.implode(',', self::HOURS)],
        ];
    }

    public function get(): array
    {
        return array_intersect_key(array_replace(self::defaults(), (array) $this->settings->get(self::KEY, [])), self::defaults());
    }

    public function save(array $data): array
    {
        $clean = [
            'enabled' => (bool) $data['enabled'],
            'whatsapp' => (bool) $data['whatsapp'],
            'email' => (bool) $data['email'],
            'hour' => (int) $data['hour'],
        ];
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }

    public function lastSentOn(): ?string
    {
        return $this->settings->get(self::SENT_KEY);
    }

    /** The business's owner (for a branch: the main business's owner, who holds the owner role there). */
    public function owner(Tenant $tenant): ?User
    {
        $team = config('permission.column_names.team_foreign_key');

        return User::query()->select('users.*')
            ->join('model_has_roles as mhr', fn ($j) => $j->on('mhr.model_id', '=', 'users.id')->where('mhr.model_type', User::class)->where("mhr.{$team}", $tenant->id))
            ->join('roles', 'roles.id', '=', 'mhr.role_id')
            ->where('roles.name', Roles::OWNER)
            ->where('users.status', 'active')
            ->orderBy('users.id')
            ->first();
    }

    /**
     * Scheduler entry: sends yesterday's summary when it is switched on, the business-local
     * hour is the chosen one, and it has not gone out today. Returns true when sent.
     */
    public function runIfDue(Tenant $tenant, ?CarbonImmutable $now = null): bool
    {
        $s = $this->get();
        $local = ($now ?? CarbonImmutable::now())->setTimezone($tenant->timezone);
        $today = $local->format('Y-m-d');
        if (! $s['enabled'] || $local->hour !== $s['hour'] || $this->lastSentOn() === $today) {
            return false;
        }
        // Marked first: a failed delivery is retried by the queue, never by a second summary.
        $this->settings->set(self::SENT_KEY, $today);

        return $this->send($tenant, $local->subDay()->format('Y-m-d'), $s) !== [];
    }

    /**
     * Sends one summary to the owner on the chosen channels. $soFar = today until now (the
     * "send me a test" button). Returns the channels it went to.
     *
     * @return list<string>
     */
    public function send(Tenant $tenant, string $date, ?array $s = null, bool $soFar = false): array
    {
        $s ??= $this->get();
        $owner = $this->owner($tenant);
        if (! $owner) {
            return [];
        }
        $route = new AnonymousNotifiable();
        $channels = [];
        if ($s['whatsapp'] && $owner->phone) {
            $route->route('whatsapp', $owner->phone);
            $channels[] = 'whatsapp';
        }
        if ($s['email'] && $owner->email) {
            $route->route('mail', $owner->email);
            $channels[] = 'mail';
        }
        if (! $channels) {
            return [];
        }
        $locale = Locale::guest($owner->locale);
        $facts = $this->facts($tenant, $date);
        $route->notify(new DailySummaryMessage($this->text($tenant, $facts, $locale, $soFar), $this->subject($tenant, $facts, $locale, $soFar), $channels));

        return $channels;
    }

    /**
     * The numbers for one business-local day, straight from the Reports calculation.
     *
     * @return array<string, mixed>
     */
    public function facts(Tenant $tenant, string $date): array
    {
        $r = $this->analytics->overview($tenant, $date, $date);
        $today = CarbonImmutable::now($tenant->timezone)->format('Y-m-d');
        $facts = [
            'date' => $date,
            'orders' => $r['totals']['orders'],
            'sales' => $r['totals']['sales'],
            'by_type' => collect($r['by_type'])->map(fn ($g) => ['type' => $g['key'], 'orders' => $g['orders'], 'sales' => $g['sales']])->values()->all(),
            'top' => collect($r['dishes']['top'])->take(3)->map(fn ($d) => ['name' => $d['name'], 'quantity' => $d['quantity']])->values()->all(),
            'bookings' => null,
            'hotel' => null,
            'low_stock' => null,
        ];
        // Table bookings: only for businesses that take them.
        if ($this->features->enabled($tenant, 'reservations') && Reservation::exists()) {
            $facts['bookings'] = ['count' => $r['reservations']['bookings'], 'guests' => $r['reservations']['guests']];
        }
        if ($r['hotel'] !== null && $r['hotel']['rooms'] > 0) {
            $facts['hotel'] = [
                'occupancy' => $r['hotel']['occupancy'],
                'check_ins' => RoomBooking::whereIn('status', ['confirmed', 'checked_in'])->whereDate('check_in', $today)->count(),
            ];
        }
        if ($this->features->enabled($tenant, 'inventory')) {
            $low = InventoryItem::where('is_active', true)->where('low_stock_level', '>', 0)->whereColumn('stock', '<=', 'low_stock_level')->orderBy('name')->pluck('name');
            if ($low->isNotEmpty()) {
                $facts['low_stock'] = ['count' => $low->count(), 'names' => $low->take(3)->values()->all()];
            }
        }

        return $facts;
    }

    /** The message (WhatsApp-friendly, short), in lang/<locale>/owner.php. */
    public function text(Tenant $tenant, array $facts, string $locale, bool $soFar = false): string
    {
        $t = fn (string $key, array $replace = []) => trans("owner.summary.{$key}", $replace, $locale);
        $lines = [$this->subject($tenant, $facts, $locale, $soFar)];

        if ($facts['orders'] > 0) {
            $lines[] = $t('sales', ['amount' => self::inr($facts['sales']), 'orders' => $facts['orders']]);
            if (count($facts['by_type']) > 1) {
                $lines[] = collect($facts['by_type'])->map(fn ($g) => $t("types.{$g['type']}").' ₹'.self::inr($g['sales'])." ({$g['orders']})")->implode(' · ');
            }
            if ($facts['top']) {
                $lines[] = $t('top', ['dishes' => collect($facts['top'])->map(fn ($d) => Str::limit($d['name'], 24, '…')." ×{$d['quantity']}")->implode(', ')]);
            }
        } else {
            $lines[] = $t('no_orders');
        }
        if ($facts['bookings'] !== null) {
            $lines[] = $t('bookings', ['count' => $facts['bookings']['count'], 'guests' => $facts['bookings']['guests']]);
        }
        if ($facts['hotel'] !== null) {
            $lines[] = $t('hotel', ['occupancy' => $facts['hotel']['occupancy'], 'checkins' => $facts['hotel']['check_ins']]);
        }
        if ($facts['low_stock'] !== null) {
            $lines[] = $t('low_stock', ['count' => $facts['low_stock']['count'], 'names' => collect($facts['low_stock']['names'])->map(fn ($n) => Str::limit($n, 20, '…'))->implode(', ')]);
        }
        $lines[] = $t('link', ['url' => rtrim((string) config('dinedesk.dashboard_url'), '/').'/dashboard/reports']);

        return implode("\n", $lines);
    }

    public function subject(Tenant $tenant, array $facts, string $locale, bool $soFar = false): string
    {
        // Weekday and month in the owner's language; Carbon keeps Western digits for all 12.
        $date = CarbonImmutable::parse($facts['date'])->locale($locale === 'en' ? 'en_IN' : $locale)->isoFormat('ddd, D MMM');

        return $soFar
            ? trans('owner.summary.title_so_far', ['business' => $tenant->name, 'date' => $date, 'time' => CarbonImmutable::now($tenant->timezone)->format('H:i')], $locale)
            : trans('owner.summary.title', ['business' => $tenant->name, 'date' => $date], $locale);
    }

    /** "123456.50" → "1,23,456.50"; whole rupees without ".00". Indian grouping. */
    public static function inr(string $rupees): string
    {
        [$whole, $fraction] = array_pad(explode('.', ltrim($rupees, '-'), 2), 2, '00');
        $last3 = substr($whole, -3);
        $rest = substr($whole, 0, -3);
        $grouped = $rest !== '' ? preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest).','.$last3 : $last3;

        return (str_starts_with($rupees, '-') ? '-' : '').$grouped.((int) $fraction > 0 ? '.'.str_pad($fraction, 2, '0') : '');
    }
}
