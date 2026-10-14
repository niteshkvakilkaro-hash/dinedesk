<?php

namespace Tests\Feature\Saas;

use App\Modules\Audit\Models\AuditLog;
use App\Modules\Domains\Services\DnsLookup;
use App\Modules\Menu\Models\MenuItem;
use App\Modules\Ordering\Services\OrderingSettings;
use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Models\Subscription;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

/** Support login, revenue dashboard, branches, custom domains and data export. */
class PlatformOpsTest extends SaasTestCase
{
    public function test_support_login_is_reasoned_time_limited_read_only_and_audited(): void
    {
        $url = "/api/v1/platform/tenants/{$this->tenant->public_id}/support";
        $this->actingAsUser($this->admin)->postJson($url, ['reason' => 'help', 'read_only' => true])->assertStatus(422);
        $this->actingAsUser($this->owner())->postJson($url, ['reason' => 'Owner asked for help with the menu', 'read_only' => true])->assertForbidden();
        $token = $this->actingAsUser($this->admin)->postJson($url, ['reason' => 'Owner asked for help with the menu', 'read_only' => true])->assertCreated()->json('data.token');

        // A fresh request with the support token only (no actingAs).
        $this->app['auth']->forgetGuards();
        $h = ['Authorization' => "Bearer {$token}"];
        $this->getJson('/api/v1/auth/me', $h)->assertOk()->assertJsonPath('data.tenant.id', $this->tenant->public_id)
            ->assertJsonPath('data.support.read_only', true)->assertJsonPath('data.next', 'dashboard')->assertJsonPath('data.role', 'owner');
        $this->getJson('/api/v1/tenant/menu', $h)->assertOk();
        $this->postJson('/api/v1/tenant/menu/categories', ['name' => 'Soups', 'is_active' => true], $h)->assertForbidden()->assertJsonPath('meta.code', 'support_read_only');
        $this->getJson('/api/v1/platform/tenants', $h)->assertForbidden();
        $this->assertNull($this->admin->fresh()->tenant_id);
        $this->postJson('/api/v1/support/end', [], $h)->assertOk();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/auth/me', $h)->assertUnauthorized();

        // A session that may change things: every change is audited under the admin.
        $this->app['auth']->forgetGuards();
        $token = $this->actingAsUser($this->admin)->postJson($url, ['reason' => 'Fix a wrong price for the owner', 'read_only' => false])->json('data.token');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/tenant/menu/categories', ['name' => 'Soups', 'is_active' => true], ['Authorization' => "Bearer {$token}"])->assertCreated();
        $this->assertSame(['support.started', 'support.ended', 'support.started', 'support.change'], AuditLog::where('tenant_id', $this->tenant->id)->where('action', 'like', 'support.%')->orderBy('id')->pluck('action')->all());
        $this->assertSame($this->admin->email, AuditLog::where('action', 'support.change')->value('meta')['admin']);
        $this->travel(61)->minutes();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/tenant/menu', ['Authorization' => "Bearer {$token}"])->assertUnauthorized();
    }

    public function test_revenue_dashboard_counts_real_paying_businesses_only(): void
    {
        $paying = $this->business('Paying Cafe', 'pro', ['status' => 'live']);
        Subscription::withoutTenancy()->where('tenant_id', $paying->id)->update(['status' => 'active', 'plan_id' => Plan::where('code', 'pro')->value('id'), 'provider_subscription_id' => 'sub_P', 'billing_cycle' => 'yearly', 'last_charged_at' => now()]);
        $demo = $this->business('Demo Dhaba', 'growth', ['is_demo' => true]);
        Subscription::withoutTenancy()->where('tenant_id', $demo->id)->update(['status' => 'active', 'provider_subscription_id' => 'sub_D']);

        $r = $this->actingAsUser($this->admin)->getJson('/api/v1/platform/revenue')->assertOk()->json('data');
        // Pro yearly ₹39,990 → ₹3,332.50 a month; the demo doesn't count; Spice Route is trialing.
        $this->assertEquals([3332.5, 39990, 1, 1, 2], [$r['mrr'], $r['arr'], $r['paying'], $r['trialing'], $r['businesses']]);
        $this->assertSame(1, collect($r['by_plan'])->firstWhere('code', 'pro')['paying']);
        $this->actingAsUser($this->owner())->getJson('/api/v1/platform/revenue')->assertForbidden();
    }

    public function test_branches_are_linked_outlets_with_one_plan_switching_and_combined_reports(): void
    {
        $owner = $this->owner();
        // Growth has no multi-branch.
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/branches', ['name' => 'Spice Route Baner', 'city' => 'Pune'])->assertForbidden()->assertJsonPath('meta.code', 'feature_unavailable');
        $this->actingAsUser($this->admin)->patchJson("/api/v1/platform/tenants/{$this->tenant->public_id}", ['plan' => 'pro', 'reason' => 'Moved to Pro for branches'])->assertOk();

        $owner = $this->owner();
        $branch = $this->actingAsUser($owner)->postJson('/api/v1/tenant/branches', ['name' => 'Spice Route Baner', 'city' => 'Pune', 'copy_menu' => true, 'copy_theme' => true])->assertCreated()->json('data');
        $b = Tenant::where('public_id', $branch['id'])->first();
        $this->assertSame([$this->tenant->id, 'onboarding', $this->tenant->fresh()->plan_id], [$b->parent_tenant_id, $b->status, $b->plan_id]);
        $this->assertSame(
            app(TenantContext::class)->run($this->tenant, fn () => MenuItem::count()),
            app(TenantContext::class)->run($b, fn () => MenuItem::count()),
        );
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/branches/{$branch['id']}/copy-menu")->assertStatus(422)->assertJsonPath('meta.code', 'menu_not_empty');
        $this->actingAsUser($owner)->getJson('/api/v1/tenant/branches')->assertOk()->assertJsonCount(2, 'data.outlets');
        $this->actingAsUser($owner)->getJson('/api/v1/auth/me')->assertJsonCount(2, 'data.branches');

        // Switch, and back. Reports add up every outlet.
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/branches/{$branch['id']}/switch")->assertOk()->assertJsonPath('data.tenant.id', $branch['id'])->assertJsonPath('data.role', 'owner');
        $this->assertSame($b->id, $owner->fresh()->tenant_id);
        $this->actingAsUser($owner->fresh())->getJson('/api/v1/auth/me')->assertJsonPath('data.features.hotel', true);
        $this->actingAsUser($owner->fresh())->getJson('/api/v1/tenant/branches/report')->assertOk()->assertJsonCount(2, 'data.outlets');
        $this->actingAsUser($owner->fresh())->postJson('/api/v1/tenant/subscription/checkout', ['plan' => 'pro', 'cycle' => 'monthly'])->assertStatus(422)->assertJsonPath('meta.code', 'branch_billing');
        $this->actingAsUser($owner->fresh())->postJson("/api/v1/tenant/branches/{$this->tenant->public_id}/switch")->assertOk();

        // Someone from another business can't switch in; staff of the main business aren't in the branch.
        $other = $this->business('Other Place');
        $this->actingAsUser($this->ownerOf($other))->postJson("/api/v1/tenant/branches/{$branch['id']}/switch")->assertNotFound();
        $this->actingAsUser($this->staff($this->tenant, 'manager'))->postJson("/api/v1/tenant/branches/{$branch['id']}/switch")->assertForbidden();

        // Billing lapses for the business: the branch goes read-only with it.
        Subscription::withoutTenancy()->where('tenant_id', $this->tenant->id)->update(['status' => 'past_due', 'grace_ends_at' => now()->subHour()]);
        $this->artisan('subscriptions:enforce')->assertSuccessful();
        $this->assertSame(['read_only', 'read_only'], [$this->tenant->fresh()->status, $b->fresh()->status]);
    }

    public function test_custom_domain_verified_by_dns_served_and_given_tls_only_when_verified(): void
    {
        $dns = new class extends DnsLookup
        {
            public array $answer = ['cname' => [], 'a' => []];

            public function records(string $host): array
            {
                return $this->answer;
            }
        };
        $this->app->instance(DnsLookup::class, $dns);
        config(['dinedesk.domains.cname_target' => 'sites.dinedesk.test']);
        $owner = $this->owner();

        $this->actingAsUser($owner)->postJson('/api/v1/tenant/domains', ['domain' => 'not a domain'])->assertStatus(422);
        $this->actingAsUser($owner)->postJson('/api/v1/tenant/domains', ['domain' => 'x.'.config('dinedesk.platform_domain')])->assertStatus(422);
        $d = collect($this->actingAsUser($owner)->postJson('/api/v1/tenant/domains', ['domain' => 'https://WWW.SpiceRoute.in/menu'])->assertCreated()->json('data.domains'))->firstWhere('type', 'custom');
        $this->assertSame('www.spiceroute.in', $d['domain']);
        $this->getJson('/api/v1/tls/ask?domain=www.spiceroute.in')->assertNotFound();
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => 'www.spiceroute.in'])->assertNotFound();

        $dns->answer = ['cname' => ['somewhere.else'], 'a' => []];
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/domains/{$d['id']}/verify")->assertStatus(422)->assertJsonPath('meta.code', 'dns_not_ready');
        $dns->answer = ['cname' => ['sites.dinedesk.test'], 'a' => []];
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/domains/{$d['id']}/verify")->assertOk();
        $this->actingAsUser($owner)->postJson("/api/v1/tenant/domains/{$d['id']}/primary")->assertOk();

        $this->getJson('/api/v1/tls/ask?domain=www.spiceroute.in')->assertOk();
        $this->getJson('/api/v1/tls/ask?domain=evil.example.com')->assertNotFound();
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => 'www.spiceroute.in'])->assertOk()->assertJsonPath('data.seo.canonical', 'https://www.spiceroute.in');

        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/domains/{$d['id']}")->assertOk();
        $this->getJson('/api/v1/site', ['X-Tenant-Host' => $this->host($this->tenant)])->assertOk()->assertJsonPath('data.seo.canonical', 'https://'.$this->host($this->tenant));

        // Starter has no custom domain.
        $starter = $this->business('Small Stall', 'starter');
        $this->actingAsUser($this->ownerOf($starter))->postJson('/api/v1/tenant/domains', ['domain' => 'smallstall.in'])->assertForbidden();
    }

    public function test_owner_exports_all_business_data_without_secrets(): void
    {
        Storage::fake('local');
        $owner = $this->owner();
        $this->postJson('/api/v1/site/orders', $this->orderPayload(), $this->site())->assertCreated();
        $this->asTenant(fn () => app(OrderingSettings::class)->saveRazorpay('rzp_live_X', 'very_secret_key', 'whsec_secret'));

        $e = $this->actingAsUser($owner)->postJson('/api/v1/tenant/exports')->assertCreated()->json('data');
        $list = $this->actingAsUser($owner)->getJson('/api/v1/tenant/exports')->assertOk()->json('data.0');
        $this->assertSame('ready', $list['status']);
        $file = $this->actingAsUser($owner)->get("/api/v1/tenant/exports/{$e['id']}")->assertOk();
        $path = $file->baseResponse->getFile()->getPathname();
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true);
        $names = array_map(fn ($i) => $zip->getNameIndex($i), range(0, $zip->numFiles - 1));
        $this->assertContains('data/orders.json', $names);
        $this->assertContains('csv/menu.csv', $names);
        $this->assertContains('README.txt', $names);
        $all = implode('', array_map(fn ($n) => $zip->getFromName($n), $names));
        $this->assertStringContainsString('Asha Verma', $all);
        foreach (['very_secret_key', 'whsec_secret', 'tracking_token', '"password"'] as $secret) {
            $this->assertStringNotContainsString($secret, $all);
        }
        $zip->close();

        // Another business can't download it; the super admin can export for support (with a reason).
        $this->actingAsUser($this->ownerOf($this->business('Other Place')))->get("/api/v1/tenant/exports/{$e['id']}")->assertNotFound();
        $this->actingAsUser($this->admin)->postJson("/api/v1/platform/tenants/{$this->tenant->public_id}/export", ['reason' => 'Owner asked for a copy'])->assertCreated();
        $this->travel(8)->days();
        $this->artisan('exports:purge')->assertSuccessful();
        $this->actingAsUser($owner)->get("/api/v1/tenant/exports/{$e['id']}")->assertNotFound();
    }
}
