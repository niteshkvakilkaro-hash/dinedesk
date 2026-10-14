<?php

namespace App\Modules\Marketing\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Marketing\Models\Campaign;
use App\Modules\Marketing\Notifications\CampaignMessage;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Website\Services\SitePresenter;
use App\Support\ApiException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Str;

/**
 * Messages to customers who said yes to offers (and only them). Every message carries
 * an unsubscribe link; one tap there turns offers off for that customer.
 */
class Campaigns
{
    public const CHANNELS = ['whatsapp', 'sms', 'email'];

    public function __construct(private readonly SitePresenter $site) {}

    /** Opted-in customers matching the filters, reachable on the channel. */
    public function audience(array $f, string $channel): Builder
    {
        return Customer::query()
            ->where('marketing_opt_in', true)
            ->when($channel === 'email', fn ($q) => $q->whereNotNull('email'), fn ($q) => $q->whereNotNull('phone'))
            ->when(! empty($f['tags']), fn ($q) => $q->where(function ($w) use ($f) {
                foreach ($f['tags'] as $tag) {
                    $w->orWhereJsonContains('tags', $tag);
                }
            }))
            ->when(! empty($f['min_visits']), fn ($q) => $q->where('visits', '>=', (int) $f['min_visits']))
            ->when(! empty($f['inactive_days']), fn ($q) => $q->where(fn ($w) => $w->whereNull('last_order_at')->orWhere('last_order_at', '<', now()->subDays((int) $f['inactive_days']))))
            ->when(! empty($f['birthday_month']), fn ($q) => $q->where('dates_opt_in', true)->whereMonth('birthday', (int) $f['birthday_month']));
    }

    public function send(Tenant $tenant, array $data, User $by): Campaign
    {
        $query = $this->audience($data['audience'] ?? [], $data['channel']);
        $count = (clone $query)->count();
        if ($count === 0) {
            throw new ApiException('No opted-in customers match. Nothing was sent.', 422, 'no_recipients');
        }
        $campaign = Campaign::create([
            'name' => strip_tags($data['name']),
            'channel' => $data['channel'],
            'message' => strip_tags($data['message']),
            'audience' => $data['audience'] ?? [],
            'recipients' => $count,
            'status' => 'sent',
            'created_by' => $by->id,
            'sent_at' => now(),
        ]);
        $base = rtrim(str_replace('{host}', $this->site->primaryHost($tenant), (string) config('dinedesk.site_url_pattern')), '/');

        $query->chunkById(200, function ($customers) use ($campaign, $tenant, $base) {
            foreach ($customers as $c) {
                if (! $c->unsubscribe_token) {
                    $c->update(['unsubscribe_token' => Str::random(40)]);
                }
                $text = strtr($campaign->message, ['{name}' => Str::of($c->name)->before(' ')->value()]);
                $route = (new AnonymousNotifiable)->route($campaign->channel === 'email' ? 'mail' : $campaign->channel, $campaign->channel === 'email' ? $c->email : $c->phone);
                $route->notify(new CampaignMessage($text, $tenant->name, "{$base}/unsubscribe?t={$c->unsubscribe_token}", $campaign->channel === 'email' ? 'mail' : $campaign->channel, $campaign->name));
            }
        });
        AuditLog::record('campaign.sent', $campaign, ['recipients' => $count, 'channel' => $campaign->channel]);

        return $campaign;
    }

    public function unsubscribe(string $token): bool
    {
        $c = Customer::where('unsubscribe_token', $token)->first();
        if (! $c) {
            return false;
        }
        $c->update(['marketing_opt_in' => false]);

        return true;
    }
}
