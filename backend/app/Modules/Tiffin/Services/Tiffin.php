<?php

namespace App\Modules\Tiffin\Services;

use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Ordering\Models\Customer;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tiffin\Models\MealDelivery;
use App\Modules\Tiffin\Models\MealPayment;
use App\Modules\Tiffin\Models\MealPlan;
use App\Modules\Tiffin\Models\MealSubscription;
use App\Modules\Tiffin\Notifications\TiffinNotifier;
use App\Modules\Tiffin\Notifications\TiffinRequestForStaff;
use App\Support\ApiException;
use App\Support\Phone;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Tiffin / meal subscriptions. A subscriber buys a plan (so many meals, valid so many days),
 * paid at the counter or by UPI; the kitchen sees each day's list per slot, and each meal
 * marked delivered uses one. A skipped day (on leave) uses no meal and adds a day of validity.
 */
class Tiffin
{
    public function __construct(private readonly TiffinNotifier $notifier) {}

    /** The business's calendar date, as a plain date (like the date columns) so day counts line up. */
    public function today(Tenant $tenant): CarbonImmutable
    {
        return CarbonImmutable::parse(CarbonImmutable::now($tenant->timezone)->format('Y-m-d'));
    }

    /** Subscriptions past their last day, or with every meal used, are completed. */
    public function settle(Tenant $tenant): void
    {
        $today = $this->today($tenant)->format('Y-m-d');
        MealSubscription::where('status', 'active')->where(fn ($q) => $q->where('ends_on', '<', $today)->orWhereColumn('meals_used', '>=', 'meals_total'))
            ->update(['status' => 'completed']);
    }

    /** From the website: a request the restaurant confirms once paid. */
    public function request(Tenant $tenant, MealPlan $plan, array $d): MealSubscription
    {
        $sub = $this->make($plan, $d + ['status' => 'requested', 'source' => 'website']);
        $staff = User::where('tenant_id', $tenant->id)->where('status', 'active')->get()
            ->filter(fn (User $u) => in_array('orders.manage', $u->tenantPermissions(), true));
        Notification::send($staff, new TiffinRequestForStaff($sub));

        return $sub;
    }

    /** Signed up at the counter: active straight away when paid. */
    public function create(Tenant $tenant, MealPlan $plan, array $d, User $by): MealSubscription
    {
        return DB::transaction(function () use ($plan, $d, $by) {
            $sub = $this->make($plan, $d + ['status' => 'requested', 'source' => 'staff']);

            return $this->activate($sub, (float) $d['amount'], $d['mode'], $d['starts_on'], $by);
        });
    }

    public function activate(MealSubscription $sub, float $amount, string $mode, ?string $startsOn, User $by): MealSubscription
    {
        if ($sub->status !== 'requested') {
            throw new ApiException('This subscription has already started.', 422, 'not_requested');
        }
        $plan = $sub->plan ?? throw new ApiException('This plan no longer exists. Pick another plan.', 422, 'no_plan');
        $start = CarbonImmutable::parse($startsOn ?? $sub->starts_on->format('Y-m-d'));

        return DB::transaction(function () use ($sub, $plan, $amount, $mode, $start, $by) {
            $sub->update([
                'status' => 'active',
                'starts_on' => $start->format('Y-m-d'),
                'ends_on' => $start->addDays($plan->days_valid - 1)->format('Y-m-d'),
                'meals_total' => $plan->meals,
                'amount_paid' => $amount,
            ]);
            $this->pay($sub, $amount, $mode, 'start', $by);
            AuditLog::record('tiffin.started', $sub, ['code' => $sub->code(), 'amount' => $amount]);
            $sub = $sub->fresh('plan');
            // Sent once the transaction commits.
            $this->notifier->send($sub, 'confirmed');

            return $sub;
        });
    }

    /** Another round of the plan: more meals, validity from today or the current end. */
    public function renew(Tenant $tenant, MealSubscription $sub, float $amount, string $mode, User $by): MealSubscription
    {
        if (! in_array($sub->status, ['active', 'paused', 'completed'], true)) {
            throw new ApiException('Only a started subscription can be renewed.', 422, 'not_started');
        }
        $plan = $sub->plan ?? throw new ApiException('This plan no longer exists.', 422, 'no_plan');
        $today = $this->today($tenant);
        $from = $sub->ends_on && $sub->ends_on->gte($today) ? $sub->ends_on->addDay() : $today;

        return DB::transaction(function () use ($sub, $plan, $amount, $mode, $from, $by) {
            $sub->update([
                'status' => $sub->status === 'paused' ? 'paused' : 'active',
                'meals_total' => $sub->meals_total + $plan->meals,
                'ends_on' => $from->addDays($plan->days_valid - 1)->format('Y-m-d'),
                'amount_paid' => (float) $sub->amount_paid + $amount,
            ]);
            $this->pay($sub, $amount, $mode, 'renewal', $by);
            AuditLog::record('tiffin.renewed', $sub, ['code' => $sub->code(), 'amount' => $amount]);

            return $sub->fresh('plan');
        });
    }

    public function pause(Tenant $tenant, MealSubscription $sub): MealSubscription
    {
        if ($sub->status !== 'active') {
            throw new ApiException('Only an active subscription can be paused.', 422, 'not_active');
        }
        $sub->update(['status' => 'paused', 'paused_on' => $this->today($tenant)->format('Y-m-d')]);
        $this->notifier->send($sub, 'paused');

        return $sub;
    }

    /** Back from a pause: the days away are added to the validity. */
    public function resume(Tenant $tenant, MealSubscription $sub): MealSubscription
    {
        if ($sub->status !== 'paused') {
            throw new ApiException('This subscription is not paused.', 422, 'not_paused');
        }
        $away = $sub->paused_on ? (int) $sub->paused_on->diffInDays($this->today($tenant)) : 0;
        $sub->update(['status' => 'active', 'paused_on' => null, 'ends_on' => $sub->ends_on?->addDays($away)->format('Y-m-d')]);
        $this->notifier->send($sub, 'resumed');

        return $sub;
    }

    /** A request turned down, or a running subscription stopped; the subscriber is told either way. */
    public function cancel(MealSubscription $sub): MealSubscription
    {
        if (in_array($sub->status, MealSubscription::OPEN, true)) {
            $kind = $sub->status === 'requested' ? 'declined' : 'cancelled';
            $sub->update(['status' => 'cancelled']);
            $this->notifier->send($sub, $kind);
        }

        return $sub;
    }

    /** The day's list for one slot, with what's been marked. */
    public function day(Tenant $tenant, string $date, string $slot): array
    {
        $this->settle($tenant);
        $subs = MealSubscription::with('plan')->whereIn('status', ['active', 'paused'])
            ->where('starts_on', '<=', $date)->where('ends_on', '>=', $date)
            ->whereIn('slot', [$slot, 'both'])->orderBy('address')->get();
        $marks = MealDelivery::where('date', $date)->where('slot', $slot)->whereIn('meal_subscription_id', $subs->pluck('id'))->pluck('status', 'meal_subscription_id');
        // A subscriber with no meals left still shows if today's meal was already delivered.
        $subs = $subs->filter(fn (MealSubscription $s) => $s->remaining() > 0 || isset($marks[$s->id]));

        return [
            'date' => $date,
            'slot' => $slot,
            'list' => $subs->map(fn (MealSubscription $s) => $this->present($s) + ['mark' => $s->status === 'paused' ? 'paused' : ($marks[$s->id] ?? null)])->values(),
            'counts' => [
                'total' => $subs->where('status', 'active')->count(),
                'delivered' => $marks->filter(fn ($m) => $m === 'delivered')->count(),
                'skipped' => $marks->filter(fn ($m) => $m === 'skipped')->count(),
            ],
        ];
    }

    /** Delivered (uses a meal), skipped (adds a day) or cleared. */
    public function mark(MealSubscription $sub, string $date, string $slot, ?string $status, User $by): MealSubscription
    {
        if (! in_array($slot, $sub->slots(), true)) {
            throw new ApiException('This subscriber does not get that meal.', 422, 'wrong_slot');
        }
        if ($status && $sub->status !== 'active') {
            throw new ApiException('Only an active subscription can be marked.', 422, 'not_active');
        }

        return DB::transaction(function () use ($sub, $date, $slot, $status, $by) {
            $sub = MealSubscription::lockForUpdate()->findOrFail($sub->id);
            $current = MealDelivery::where('meal_subscription_id', $sub->id)->where('date', $date)->where('slot', $slot)->first();
            if ($current?->status === $status) {
                return $sub;
            }
            if ($status === 'delivered' && $sub->remaining() < 1) {
                throw new ApiException('No meals left on this plan. Renew it first.', 422, 'no_meals');
            }
            $daySkippedBefore = $this->skippedDay($sub, $date);
            $current?->delete();
            if ($current?->status === 'delivered') {
                $sub->meals_used--;
            }
            if ($status) {
                MealDelivery::create(['meal_subscription_id' => $sub->id, 'date' => $date, 'slot' => $slot, 'status' => $status, 'user_id' => $by->id]);
                if ($status === 'delivered') {
                    $sub->meals_used++;
                }
            }
            // One extra day of validity for a day with every meal skipped.
            $daySkippedAfter = $this->skippedDay($sub, $date);
            if ($daySkippedAfter !== $daySkippedBefore && $sub->ends_on) {
                $sub->ends_on = $sub->ends_on->addDays($daySkippedAfter ? 1 : -1);
            }
            if ($sub->status === 'active' && $sub->remaining() === 0) {
                $sub->status = 'completed';
            } elseif ($sub->status === 'completed' && $sub->remaining() > 0) {
                $sub->status = 'active';
            }
            $sub->save();

            return $sub;
        });
    }

    public function present(MealSubscription $s): array
    {
        return [
            'id' => $s->id,
            'code' => $s->code(),
            'status' => $s->status,
            'plan' => $s->plan ? ['id' => $s->plan->id, 'name' => $s->plan->name, 'diet' => $s->plan->diet, 'price' => $s->plan->price] : null,
            'name' => $s->name,
            'phone' => $s->phone,
            'address' => $s->address,
            'slot' => $s->slot,
            'starts_on' => $s->starts_on?->format('Y-m-d'),
            'ends_on' => $s->ends_on?->format('Y-m-d'),
            'paused_on' => $s->paused_on?->format('Y-m-d'),
            'meals_total' => $s->meals_total,
            'meals_used' => $s->meals_used,
            'remaining' => $s->remaining(),
            'amount_paid' => $s->amount_paid,
            'notes' => $s->notes,
            'source' => $s->source,
            'created_at' => $s->created_at->toIso8601String(),
        ];
    }

    /** Payments taken in a period (for the profit and loss). */
    public function income(Tenant $tenant, CarbonImmutable $from, CarbonImmutable $to): float
    {
        return (float) MealPayment::whereBetween('paid_at', [$from->startOfDay()->utc(), $to->endOfDay()->utc()])->sum('amount');
    }

    private function make(MealPlan $plan, array $d): MealSubscription
    {
        $phone = Phone::normalize($d['phone']);
        $customer = Customer::firstOrNew(['phone' => $phone]);
        if (! $customer->exists) {
            $customer->fill(['name' => strip_tags($d['name'])])->save();
        }
        $slot = $plan->slot === 'both' ? ($d['slot'] ?? 'both') : $plan->slot;

        return DB::transaction(fn () => MealSubscription::create([
            'number' => (int) MealSubscription::lockForUpdate()->max('number') + 1,
            'meal_plan_id' => $plan->id,
            'customer_id' => $customer->id,
            'name' => strip_tags($d['name']),
            'phone' => $phone,
            'address' => strip_tags($d['address']),
            'slot' => in_array($slot, MealPlan::SLOTS, true) ? $slot : $plan->slot,
            'status' => $d['status'],
            'starts_on' => $d['starts_on'],
            'notes' => isset($d['notes']) ? strip_tags($d['notes']) : null,
            'source' => $d['source'],
            'locale' => $d['locale'] ?? 'en',
        ])->load('plan'));
    }

    private function pay(MealSubscription $sub, float $amount, string $mode, string $kind, User $by): void
    {
        if ($amount > 0) {
            MealPayment::create(['meal_subscription_id' => $sub->id, 'amount' => $amount, 'mode' => $mode, 'kind' => $kind, 'user_id' => $by->id, 'paid_at' => now()]);
        }
    }

    /** Every slot of the subscription skipped on that date. */
    private function skippedDay(MealSubscription $sub, string $date): bool
    {
        $skipped = MealDelivery::where('meal_subscription_id', $sub->id)->where('date', $date)->where('status', 'skipped')->pluck('slot');

        return collect($sub->slots())->every(fn ($s) => $skipped->contains($s));
    }
}
