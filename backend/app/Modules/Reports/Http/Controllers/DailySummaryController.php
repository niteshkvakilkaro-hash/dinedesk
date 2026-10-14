<?php

namespace App\Modules\Reports\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Reports\Services\DailySummary;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Locale;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Reports → Daily summary: the owner's morning WhatsApp / email about yesterday. */
class DailySummaryController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly DailySummary $summary) {}

    public function show(Request $request): JsonResponse
    {
        return $this->ok($this->payload($request));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(DailySummary::rules());
        if ($data['enabled'] && ! $data['whatsapp'] && ! $data['email']) {
            throw ValidationException::withMessages(['whatsapp' => 'Choose WhatsApp, email or both.']);
        }
        $this->summary->save($data);
        AuditLog::record('daily_summary.updated', null, $data);

        return $this->ok($this->payload($request), 'Saved.');
    }

    /** "Send me a test now": today so far, to the owner, on the channels chosen (throttled). */
    public function test(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $s = $this->summary->get();
        $sent = $this->summary->send($tenant, CarbonImmutable::now($tenant->timezone)->format('Y-m-d'), $s, true);
        if ($sent === []) {
            throw new ApiException('Nothing was sent: the owner\'s account has no mobile number or email for the channel chosen.', 422, 'no_channel');
        }
        AuditLog::record('daily_summary.test', null, ['channels' => $sent]);

        return $this->ok(['channels' => $sent], 'Sent.');
    }

    private function payload(Request $request): array
    {
        $tenant = $this->context->require();
        $owner = $this->summary->owner($tenant);
        $yesterday = CarbonImmutable::now($tenant->timezone)->subDay()->format('Y-m-d');
        $locale = Locale::guest($owner?->locale);

        return [
            'settings' => $this->summary->get(),
            'hours' => DailySummary::HOURS,
            'timezone' => $tenant->timezone,
            'last_sent_on' => $this->summary->lastSentOn(),
            'owner' => $owner ? ['name' => $owner->name, 'phone' => $owner->phone, 'email' => $owner->email, 'locale' => $locale] : null,
            // What tomorrow's message would look like, from yesterday's real numbers.
            'preview' => $this->summary->text($tenant, $this->summary->facts($tenant, $yesterday), $locale),
        ];
    }
}
