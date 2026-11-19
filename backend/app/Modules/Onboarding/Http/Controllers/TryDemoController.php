<?php

namespace App\Modules\Onboarding\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Identity\Actions\IssueToken;
use App\Modules\Onboarding\Support\DemoBusiness;
use App\Modules\Tenancy\Support\TenantResolver;
use App\Support\Locale;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * "Try live demo" on the website: the visitor gets their own sample business (a full copy of one
 * of the showcase demos: menu with photos, website, ordering, tables or rooms) on a fresh account,
 * and is signed straight in. It lasts DAYS days (demos:expire). Their name and mobile are kept
 * on the business as a lead for the super admin; the mobile is not put on the account, so the
 * same number can still sign up for real later.
 */
class TryDemoController extends Controller
{
    public const DAYS = 7;

    /** Business type picked on the form => the showcase demo it copies. */
    private const TEMPLATES = ['restaurant' => 'haveli', 'cafe' => 'bistro', 'cloud_kitchen' => 'qsr', 'hotel' => 'rajwada'];

    private const LABELS = ['restaurant' => 'Restaurant', 'cafe' => 'Cafe', 'cloud_kitchen' => 'Kitchen', 'hotel' => 'Hotel'];

    public function __invoke(Request $request, DemoBusiness $demos, IssueToken $issueToken): JsonResponse
    {
        $request->merge(['phone' => Phone::normalize($request->input('phone'))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:60'],
            'phone' => ['required', Phone::RULE],
            'business_type' => ['required', Rule::in(array_keys(self::TEMPLATES))],
        ], ['phone.regex' => Phone::MESSAGE]);

        $name = trim(strip_tags($data['name']));
        $first = Str::of($name)->explode(' ')->first() ?: $name;
        $email = 'demo-'.Str::lower(Str::random(10)).'@demo.'.config('dinedesk.platform_domain');
        $password = Str::password(10, symbols: false);

        [$owner, $tenant] = DB::transaction(function () use ($data, $name, $first, $email, $password, $demos, $request) {
            $owner = User::create([
                'name' => $name,
                'email' => $email,
                'password' => $password,
                'email_verified_at' => now(),
                'locale' => Locale::guest($request->header('X-Locale')),
            ]);
            $label = self::LABELS[$data['business_type']];
            $tenant = $demos->create($owner, DemoBusiness::spec(self::TEMPLATES[$data['business_type']]), "{$first}'s {$label} Demo");
            $tenant->update([
                'demo_expires_at' => now()->addDays(self::DAYS),
                'demo_lead' => ['name' => $name, 'phone' => $data['phone'], 'ip' => $request->ip()],
            ]);

            return [$owner->fresh(), $tenant];
        });

        return $this->created($issueToken($owner) + [
            'demo' => [
                'email' => $email,
                'password' => $password,
                'expires_at' => $tenant->demo_expires_at->toIso8601String(),
                'site_host' => TenantResolver::subdomainFor($tenant->slug),
            ],
        ], 'Your demo is ready.');
    }
}
