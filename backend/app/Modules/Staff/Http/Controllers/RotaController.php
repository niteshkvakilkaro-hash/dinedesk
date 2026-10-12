<?php

namespace App\Modules\Staff\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Staff\Models\Attendance;
use App\Modules\Staff\Models\Shift;
use App\Modules\Staff\Services\Rota;
use App\Modules\Tenancy\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Shifts and attendance. Clocking is for everyone; the rota and corrections need staff.schedule. */
class RotaController extends Controller
{
    private const TIME = 'regex:/^([01]\d|2[0-3]):[0-5]\d$/';

    public function __construct(private readonly TenantContext $context, private readonly Rota $rota) {}

    public function me(Request $request): JsonResponse
    {
        return $this->ok($this->rota->me($this->context->require(), $request->user()));
    }

    public function clock(Request $request): JsonResponse
    {
        $entry = $this->rota->clock($this->context->require(), $request->user());

        return $this->ok($this->rota->me($this->context->require(), $request->user()), $entry->wasRecentlyCreated ? 'Clocked in.' : 'Clocked out.');
    }

    public function week(Request $request): JsonResponse
    {
        return $this->ok($this->rota->week($this->context->require(), $this->startOf($request)));
    }

    public function store(Request $request): JsonResponse
    {
        $shift = Shift::create($this->validShift($request));

        return $this->created($shift->present(), 'Shift added.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $shift = Shift::findOrFail($id);
        $shift->update($this->validShift($request));

        return $this->ok($shift->present(), 'Saved.');
    }

    public function destroy(int $id): JsonResponse
    {
        Shift::findOrFail($id)->delete();

        return $this->ok(null, 'Shift removed.');
    }

    public function copyWeek(Request $request): JsonResponse
    {
        $count = $this->rota->copyWeek($this->context->require(), $this->startOf($request));

        return $this->ok(['copied' => $count], $count ? "Copied {$count} shifts from last week." : 'Last week had no shifts to copy.');
    }

    public function report(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $d = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $today = $this->rota->today($tenant);
        $to = $d['to'] ?? $today->format('Y-m-d');
        $from = $d['from'] ?? $today->startOfMonth()->format('Y-m-d');
        if (CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) > 92) {
            $from = CarbonImmutable::parse($to)->subDays(92)->format('Y-m-d');
        }

        return $this->ok($this->rota->report($tenant, $from, $to));
    }

    public function saveEntry(Request $request, ?int $id = null): JsonResponse
    {
        $tenant = $this->context->require();
        $d = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenant->id)],
            'date' => ['required', 'date_format:Y-m-d'],
            'clock_in' => ['required', self::TIME],
            'clock_out' => ['nullable', self::TIME],
            'note' => ['nullable', 'string', 'max:150'],
        ], ['clock_in.regex' => 'Use a time like 09:30.', 'clock_out.regex' => 'Use a time like 18:00.']);
        $entry = $this->rota->saveEntry($tenant, $id ? Attendance::findOrFail($id) : null, $d['user_id'], $d['date'], $d['clock_in'], $d['clock_out'] ?? null, $d['note'] ?? null);

        return $id ? $this->ok($entry->present(), 'Saved.') : $this->created($entry->present(), 'Entry added.');
    }

    public function destroyEntry(int $id): JsonResponse
    {
        Attendance::findOrFail($id)->delete();

        return $this->ok(null, 'Entry removed.');
    }

    private function validShift(Request $request): array
    {
        $d = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('tenant_id', $this->context->require()->id)->where('status', 'active')],
            'date' => ['required', 'date_format:Y-m-d'],
            'starts' => ['required', self::TIME],
            'ends' => ['required', self::TIME, 'different:starts'],
            'note' => ['nullable', 'string', 'max:100'],
        ], ['starts.regex' => 'Use a time like 09:00.', 'ends.regex' => 'Use a time like 17:00.']);
        $d['note'] = isset($d['note']) ? strip_tags($d['note']) : null;

        return $d;
    }

    private function startOf(Request $request): CarbonImmutable
    {
        $d = $request->validate(['start' => ['nullable', 'date_format:Y-m-d']]);

        return isset($d['start']) ? CarbonImmutable::parse($d['start']) : $this->rota->today($this->context->require());
    }
}
