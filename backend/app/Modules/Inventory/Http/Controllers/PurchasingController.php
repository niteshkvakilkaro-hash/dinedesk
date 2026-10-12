<?php

namespace App\Modules\Inventory\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Inventory\Models\PurchaseOrder;
use App\Modules\Inventory\Models\Supplier;
use App\Modules\Inventory\Services\Purchasing;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Suppliers and purchase orders (Inventory). */
class PurchasingController extends Controller
{
    public function __construct(private readonly TenantContext $context, private readonly Purchasing $purchasing) {}

    public function suppliers(): JsonResponse
    {
        return $this->ok(Supplier::orderBy('name')->get()->map(fn (Supplier $s) => $s->only(['id', 'name', 'phone', 'email', 'gstin', 'notes', 'is_active']))->values());
    }

    public function saveSupplier(Request $request, ?int $id = null): JsonResponse
    {
        if ($request->filled('phone')) {
            $request->merge(['phone' => Phone::normalize((string) $request->input('phone'))]);
        }
        $d = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', Phone::RULE],
            'email' => ['nullable', 'email', 'max:160'],
            'gstin' => ['nullable', 'regex:/^[0-9]{2}[A-Z0-9]{13}$/i'],
            'notes' => ['nullable', 'string', 'max:300'],
            'is_active' => ['sometimes', 'boolean'],
        ], ['phone.regex' => Phone::MESSAGE, 'gstin.regex' => 'Enter a 15-character GSTIN.']);
        $d['name'] = strip_tags($d['name']);
        $d['gstin'] = isset($d['gstin']) ? strtoupper($d['gstin']) : null;
        $d['notes'] = isset($d['notes']) ? strip_tags($d['notes']) : null;
        $s = $id ? tap(Supplier::findOrFail($id))->update($d) : Supplier::create($d);

        return $id ? $this->ok(['id' => $s->id], 'Saved.') : $this->created(['id' => $s->id], 'Supplier added.');
    }

    public function orders(): JsonResponse
    {
        return $this->ok(PurchaseOrder::with(['supplier', 'lines.item'])->orderByDesc('id')->limit(100)->get()->map(fn (PurchaseOrder $po) => $this->present($po))->values());
    }

    public function suggestions(): JsonResponse
    {
        return $this->ok($this->purchasing->suggestions());
    }

    public function saveOrder(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')->where('tenant_id', $this->context->require()->id)],
            'expected_on' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:300'],
            'lines' => ['required', 'array', 'min:1', 'max:60'],
            'lines.*.inventory_item_id' => ['required', 'integer', 'distinct', Rule::exists('inventory_items', 'id')->where('tenant_id', $this->context->require()->id)],
            'lines.*.quantity' => ['required', 'numeric', 'min:0.001', 'max:1000000'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ]);
        $po = $this->purchasing->save($id ? PurchaseOrder::findOrFail($id) : null, $d['supplier_id'], $d['lines'], $d['expected_on'] ?? null, $d['notes'] ?? null, $request->user());

        return $id ? $this->ok($this->present($po), 'Saved.') : $this->created($this->present($po), 'Purchase order created.');
    }

    public function send(int $id): JsonResponse
    {
        $po = $this->purchasing->markSent(PurchaseOrder::with(['supplier', 'lines.item'])->findOrFail($id));

        return $this->ok($this->present($po->fresh(['supplier', 'lines.item'])), 'Marked as sent.');
    }

    public function receive(Request $request, int $id): JsonResponse
    {
        $d = $request->validate([
            'lines' => ['nullable', 'array'],
            'lines.*.id' => ['required', 'integer'],
            'lines.*.received' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'lines.*.unit_cost' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ]);
        $received = collect($d['lines'] ?? [])->keyBy('id')->map(fn ($l) => ['received' => (float) $l['received'], 'unit_cost' => $l['unit_cost'] ?? null])->all();
        $po = $this->purchasing->receive(PurchaseOrder::findOrFail($id), $received, $request->user());

        return $this->ok($this->present($po), 'Received into stock.');
    }

    public function cancel(int $id): JsonResponse
    {
        $po = PurchaseOrder::findOrFail($id);
        if (! in_array($po->status, ['draft', 'sent'], true)) {
            return $this->ok($this->present($po->load(['supplier', 'lines.item'])));
        }
        $po->update(['status' => 'cancelled']);

        return $this->ok($this->present($po->load(['supplier', 'lines.item'])), 'Cancelled.');
    }

    private function present(PurchaseOrder $po): array
    {
        return [
            'id' => $po->id,
            'code' => $po->code(),
            'status' => $po->status,
            'supplier' => $po->supplier?->only(['id', 'name', 'phone']),
            'expected_on' => $po->expected_on?->format('Y-m-d'),
            'notes' => $po->notes,
            'total' => $po->total,
            'sent_at' => $po->sent_at?->toIso8601String(),
            'received_at' => $po->received_at?->toIso8601String(),
            'created_at' => $po->created_at->toIso8601String(),
            'lines' => $po->lines->map(fn ($l) => ['id' => $l->id, 'inventory_item_id' => $l->inventory_item_id, 'name' => $l->item?->name, 'unit' => $l->item?->unit, 'quantity' => $l->quantity, 'unit_cost' => $l->unit_cost, 'received_quantity' => $l->received_quantity])->values(),
            'message' => $this->purchasing->message($po, $this->context->require()->name),
        ];
    }
}
