<?php

namespace App\Modules\Marketing\Services;

use App\Modules\Marketing\Models\AutomationSend;
use App\Modules\Marketing\Notifications\CampaignMessage;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Settings\Services\TenantSettings;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Services\SitePresenter;
use Carbon\CarbonImmutable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Str;

/**
 * Automatic messages the owner switches on once: a birthday and an anniversary wish, and a
 * "we miss you" after some weeks without an order. Only to customers who said yes to offers
 * (and, for the dates, agreed to share them), each with an unsubscribe link, never twice.
 */
class Automations
{
    public const KEY = 'automations';

    public const KINDS = ['birthday', 'anniversary', 'winback'];

    public function __construct(private readonly TenantSettings $settings, private readonly SitePresenter $site) {}

    public static function defaults(): array
    {
        return [
            'channel' => 'whatsapp',
            'birthday' => ['enabled' => false, 'message' => 'Happy birthday, {name}! Celebrate with us this week.'],
            'anniversary' => ['enabled' => false, 'message' => 'Happy anniversary, {name}! Make it special with a meal with us.'],
            'winback' => ['enabled' => false, 'days' => 30, 'message' => 'We miss you, {name}! Come back and see what is new on our menu.'],
        ];
    }

    public static function rules(): array
    {
        return [
            'channel' => ['required', 'in:whatsapp,email'],
            'birthday.enabled' => ['required', 'boolean'],
            'birthday.message' => ['required', 'string', 'min:5', 'max:500'],
            'anniversary.enabled' => ['required', 'boolean'],
            'anniversary.message' => ['required', 'string', 'min:5', 'max:500'],
            'winback.enabled' => ['required', 'boolean'],
            'winback.days' => ['required', 'integer', 'min:14', 'max:180'],
            'winback.message' => ['required', 'string', 'min:5', 'max:500'],
        ];
    }

    public function get(): array
    {
        return array_replace_recursive(self::defaults(), (array) $this->settings->get(self::KEY, []));
    }

    public function save(array $data): array
    {
        $clean = self::defaults();
        $clean['channel'] = $data['channel'];
        foreach (self::KINDS as $k) {
            $clean[$k]['enabled'] = (bool) $data[$k]['enabled'];
            $clean[$k]['message'] = strip_tags(trim($data[$k]['message']));
        }
        $clean['winback']['days'] = (int) $data['winback']['days'];
        $this->settings->set(self::KEY, $clean);

        return $clean;
    }

    /** Who would get each message today (for the dashboard), without sending. */
    public function due(Tenant $tenant): array
    {
        $s = $this->get();
        $today = CarbonImmutable::now($tenant->timezone);

        return collect(self::KINDS)->mapWithKeys(fn ($k) => [$k => $this->recipients($k, $s, $today)->count()])->all();
    }

    /** Sends today's messages for one business; returns how many went out per kind. */
    public function run(Tenant $tenant): array
    {
        $s = $this->get();
        $today = CarbonImmutable::now($tenant->timezone);
        $base = rtrim(str_replace('{host}', $this->site->primaryHost($tenant), (string) config('dinedesk.site_url_pattern')), '/');
        $route = $s['channel'] === 'email' ? 'mail' : $s['channel'];
        $sent = [];
        foreach (self::KINDS as $kind) {
            $sent[$kind] = 0;
            if (! $s[$kind]['enabled']) {
                continue;
            }
            foreach ($this->recipients($kind, $s, $today)->get() as $c) {
                $row = AutomationSend::firstOrCreate(['customer_id' => $c->id, 'kind' => $kind, 'sent_on' => $today->format('Y-m-d')], ['channel' => $s['channel']]);
                if (! $row->wasRecentlyCreated) {
                    continue;
                }
                if (! $c->unsubscribe_token) {
                    $c->update(['unsubscribe_token' => Str::random(40)]);
                }
                $text = strtr($s[$kind]['message'], ['{name}' => Str::of($c->name)->before(' ')->value()]);
                (new AnonymousNotifiable())->route($route, $s['channel'] === 'email' ? $c->email : $c->phone)
                    ->notify(new CampaignMessage($text, $tenant->name, "{$base}/unsubscribe?t={$c->unsubscribe_token}", $route, ucfirst($kind)));
                $sent[$kind]++;
            }
        }

        return $sent;
    }

    private function recipients(string $kind, array $s, CarbonImmutable $today)
    {
        $q = Customer::query()->where('marketing_opt_in', true)
            ->when($s['channel'] === 'email', fn ($w) => $w->whereNotNull('email'), fn ($w) => $w->whereNotNull('phone'))
            ->whereNotExists(fn ($w) => $w->selectRaw(1)->from('automation_sends')->whereColumn('automation_sends.customer_id', 'customers.id')
                ->where('automation_sends.kind', $kind)->where('automation_sends.sent_on', $today->format('Y-m-d')));

        return match ($kind) {
            'birthday', 'anniversary' => $q->where('dates_opt_in', true)->whereMonth($kind, $today->month)->whereDay($kind, $today->day),
            // Inactive for the chosen days, and not already reminded since their last order.
            'winback' => $q->whereNotNull('last_order_at')->where('last_order_at', '<', $today->subDays((int) $s['winback']['days'])->utc())
                ->whereNotExists(fn ($w) => $w->selectRaw(1)->from('automation_sends as a2')->whereColumn('a2.customer_id', 'customers.id')
                    ->where('a2.kind', 'winback')->whereColumn('a2.created_at', '>', 'customers.last_order_at')),
        };
    }
}
