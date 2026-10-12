<?php

namespace Tests\Feature\Website;

use Tests\TestCase;

/** /.well-known/assetlinks.json: each website lists its own Android app; the platform lists the dashboard app. */
class AndroidAppTest extends TestCase
{
    public function test_asset_links_per_host(): void
    {
        $tenant = $this->business('Hungry Haveli');
        $host = $this->host($tenant);
        $print = implode(':', array_fill(0, 32, 'AB'));

        $this->get("http://{$host}/.well-known/assetlinks.json")->assertOk()->assertExactJson([]);
        $this->artisan('android:app', ['host' => $host, 'package' => 'in.hungryhaveli.app', 'sha256' => ['ab:cd']])->assertExitCode(1);
        $this->artisan('android:app', ['host' => $host, 'package' => 'in.hungryhaveli.app', 'sha256' => [strtolower($print)]])->assertExitCode(0);

        $this->get("http://{$host}/.well-known/assetlinks.json")->assertOk()
            ->assertJsonPath('0.relation.0', 'delegate_permission/common.handle_all_urls')
            ->assertJsonPath('0.target.package_name', 'in.hungryhaveli.app')
            ->assertJsonPath('0.target.sha256_cert_fingerprints.0', $print);

        // The platform domain lists the dashboard app from the environment.
        config(['dinedesk.android.admin_package' => 'in.dinedesk.admin', 'dinedesk.android.admin_sha256' => [$print]]);
        $this->get('http://'.config('dinedesk.platform_domain').'/.well-known/assetlinks.json')->assertJsonPath('0.target.package_name', 'in.dinedesk.admin');

        $this->artisan('android:app', ['host' => $host, '--clear' => true])->assertExitCode(0);
        $this->get("http://{$host}/.well-known/assetlinks.json")->assertExactJson([]);
    }
}
