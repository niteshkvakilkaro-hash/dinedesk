<?php

namespace App\Modules\Finance\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Finance\Models\Expense;
use App\Modules\Finance\Services\ProfitAndLoss;
use App\Modules\Tenancy\Support\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Profit and loss, expenses and what each dish costs to make. */
class FinanceController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly ProfitAndLoss $pnl) {}

    public function pnl(Request $request): JsonResponse
    {
        $tz = $this->context->require()->timezone;
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $to = $data['to'] ?? CarbonImmutable::now($tz)->format('Y-m-d');
        $from = $data['from'] ?? CarbonImmutable::now($tz)->startOfMonth()->format('Y-m-d');
        if (CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) > 366) {
            $from = CarbonImmutable::parse($to)->subDays(366)->format('Y-m-d');
        }

        return $this->ok($this->pnl->period($this->context->require(), $from, $to));
    }

    public function dishCosts(): JsonResponse
    {
        return $this->ok($this->pnl->dishCosts());
    }

    public function expenses(Request $request): JsonResponse
    {
        $month = (string) ($request->validate(['month' => ['nullable', 'date_format:Y-m']])['month'] ?? CarbonImmutable::now($this->context->require()->timezone)->format('Y-m'));
        $start = CarbonImmutable::parse("{$month}-01");

        return $this->ok(Expense::whereBetween('date', [$start->format('Y-m-d'), $start->endOfMonth()->format('Y-m-d')])->orderByDesc('date')->orderByDesc('id')->get()
            ->map(fn (Expense $e) => $e->only(['id', 'category', 'amount', 'payment_mode', 'note']) + ['date' => $e->date->format('Y-m-d')])->values());
    }

    public function store(Request $request): JsonResponse
    {
        $e = Expense::create($this->fields($request) + ['user_id' => $request->user()->id]);
        AuditLog::record('expense.created', $e, ['amount' => $e->amount, 'category' => $e->category]);

        return $this->created(['id' => $e->id], 'Expense added.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $e = Expense::findOrFail($id);
        $e->update($this->fields($request));
        AuditLog::record('expense.updated', $e, ['amount' => $e->amount, 'category' => $e->category]);

        return $this->ok(['id' => $e->id], 'Saved.');
    }

    public function destroy(int $id): JsonResponse
    {
        $e = Expense::findOrFail($id);
        AuditLog::record('expense.deleted', $e, ['amount' => $e->amount, 'category' => $e->category, 'date' => $e->date->format('Y-m-d')]);
        $e->delete();

        return $this->ok(null, 'Deleted.');
    }

    private function fields(Request $request): array
    {
        $tz = $this->context->require()->timezone;
        $d = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:'.CarbonImmutable::now($tz)->addDay()->format('Y-m-d')],
            'category' => ['required', Rule::in(Expense::CATEGORIES)],
            'amount' => ['required', 'numeric', 'min:1', 'max:10000000'],
            'payment_mode' => ['required', Rule::in(Expense::MODES)],
            'note' => ['nullable', 'string', 'max:200'],
        ]);
        $d['note'] = isset($d['note']) && trim($d['note']) !== '' ? strip_tags(trim($d['note'])) : null;

        return $d;
    }
}
