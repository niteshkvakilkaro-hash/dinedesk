<?php

namespace App\Modules\Tiffin\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Tiffin\Models\MealPayment;
use App\Modules\Tiffin\Models\MealPlan;
use App\Modules\Tiffin\Models\MealSubscription;
use App\Modules\Tiffin\Services\Tiffin;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Tiffin: plans, subscribers and each day's deliveries. */
class TiffinController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly Tiffin $tiffin) {}

    public function plans(): JsonResponse
    {
        return $this->ok(MealPlan::orderBy('sort')->orderBy('id')->get()->map(fn (MealPlan $p) => $p->present())->values());
    }

    public function savePlan(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:300'],
            'diet' => ['nullable', Rule::in(['veg', 'non_veg'])],
            'slot' => ['required', Rule::in(MealPlan::SLOTS)],
            'meals' => ['required', 'integer', 'min:1', 'max:200'],
            'days_valid' => ['required', 'integer', 'min:1', 'max:120'],
            'price' => ['required', 'numeric', 'min:0', 'max:500000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        $d['name'] = strip_tags($d['name']);
        $d['description'] = isset($d['description']) ? strip_tags($d['description']) : null;
        $plan = $id ? tap(MealPlan::findOrFail($id))->update($d) : MealPlan::create($d);

        return $id ? $this->ok($plan->present(), 'Saved.') : $this->created($plan->present(), 'Plan added.');
    }

    public function subscriptions(Request $request): JsonResponse
    {
        $this->tiffin->settle($this->context->require());
        $d = $request->validate(['status' => ['nullable', Rule::in(['open', 'requested', 'active', 'paused', 'completed', 'cancelled'])]]);
        $status = $d['status'] ?? 'open';
        $subs = MealSubscription::with('plan')->when($status === 'open', fn ($q) => $q->whereIn('status', MealSubscription::OPEN), fn ($q) => $q->where('status', $status))
            ->orderByRaw("FIELD(status, 'requested', 'active', 'paused', 'completed', 'cancelled')")->orderByDesc('id')->limit(300)->get();
        $today = $this->tiffin->today($this->context->require())->format('Y-m-d');

        return $this->ok($subs->map(fn (MealSubscription $s) => $this->tiffin->present($s))->values(), null, [
            'requested' => MealSubscription::where('status', 'requested')->count(),
            'active' => MealSubscription::where('status', 'active')->count(),
            'ending_soon' => MealSubscription::where('status', 'active')->where(fn ($q) => $q->where('ends_on', '<=', $this->tiffin->today($this->context->require())->addDays(3)->format('Y-m-d'))->orWhereRaw('meals_total - meals_used <= 3'))->count(),
            'today' => $today,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $this->validSubscriber($request, true);
        $sub = $this->tiffin->create($this->context->require(), MealPlan::findOrFail($d['meal_plan_id']), $d, $request->user());

        return $this->created($this->tiffin->present($sub), 'Subscription started.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $sub = MealSubscription::findOrFail($id);
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $d = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'address' => ['required', 'string', 'max:300'],
            'slot' => ['sometimes', Rule::in(MealPlan::SLOTS)],
            'notes' => ['nullable', 'string', 'max:300'],
        ], ['phone.regex' => Phone::MESSAGE]);
        $sub->update(array_map(fn ($v) => is_string($v) ? strip_tags($v) : $v, $d));

        return $this->ok($this->tiffin->present($sub->load('plan')), 'Saved.');
    }

    public function activate(Request $request, int $id): JsonResponse
    {
        $d = $this->validPayment($request) + $request->validate(['starts_on' => ['nullable', 'date_format:Y-m-d']]);
        $sub = $this->tiffin->activate(MealSubscription::with('plan')->findOrFail($id), (float) $d['amount'], $d['mode'], $d['starts_on'] ?? null, $request->user());

        return $this->ok($this->tiffin->present($sub), 'Subscription started.');
    }

    public function renew(Request $request, int $id): JsonResponse
    {
        $d = $this->validPayment($request);
        $sub = $this->tiffin->renew($this->context->require(), MealSubscription::with('plan')->findOrFail($id), (float) $d['amount'], $d['mode'], $request->user());

        return $this->ok($this->tiffin->present($sub), 'Renewed.');
    }

    public function pause(int $id): JsonResponse
    {
        $sub = $this->tiffin->pause($this->context->require(), MealSubscription::with('plan')->findOrFail($id));

        return $this->ok($this->tiffin->present($sub), 'Paused.');
    }

    public function resume(int $id): JsonResponse
    {
        $sub = $this->tiffin->resume($this->context->require(), MealSubscription::with('plan')->findOrFail($id));

        return $this->ok($this->tiffin->present($sub), 'Resumed.');
    }

    public function cancel(int $id): JsonResponse
    {
        $sub = MealSubscription::with('plan')->findOrFail($id);
        if (in_array($sub->status, MealSubscription::OPEN, true)) {
            $sub->update(['status' => 'cancelled']);
        }

        return $this->ok($this->tiffin->present($sub), 'Cancelled.');
    }

    public function day(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $d = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'slot' => ['nullable', Rule::in(['lunch', 'dinner'])],
        ]);

        return $this->ok($this->tiffin->day($tenant, $d['date'] ?? $this->tiffin->today($tenant)->format('Y-m-d'), $d['slot'] ?? 'lunch'));
    }

    public function mark(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.$this->tiffin->today($this->context->require())->addDay()->format('Y-m-d')],
            'slot' => ['required', Rule::in(['lunch', 'dinner'])],
            'status' => ['nullable', Rule::in(['delivered', 'skipped'])],
        ]);
        $sub = $this->tiffin->mark(MealSubscription::findOrFail($id), $d['date'], $d['slot'], $d['status'] ?? null, $request->user());

        return $this->ok($this->tiffin->present($sub->load('plan')));
    }

    private function validSubscriber(Request $request, bool $withPayment): array
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $d = $request->validate([
            'meal_plan_id' => ['required', 'integer', Rule::exists('meal_plans', 'id')->where('tenant_id', $this->context->require()->id)],
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'phone' => ['required', Phone::RULE],
            'address' => ['required', 'string', 'max:300'],
            'slot' => ['nullable', Rule::in(MealPlan::SLOTS)],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:300'],
        ], ['phone.regex' => Phone::MESSAGE]);

        return $withPayment ? $d + $this->validPayment($request) : $d;
    }

    private function validPayment(Request $request): array
    {
        return $request->validate([
            'amount' => ['required', 'numeric', 'min:0', 'max:500000'],
            'mode' => ['required', Rule::in(MealPayment::MODES)],
        ]);
    }
}
