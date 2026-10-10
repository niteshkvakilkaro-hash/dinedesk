<?php

namespace App\Modules\Tables\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Tables\Models\DiningTable;
use App\Modules\Tables\Models\TableRequest;
use App\Modules\Tables\Models\TableSession;
use App\Modules\Tables\Services\DineIn;
use App\Modules\Tenancy\Support\TenantContext;
use App\Modules\Website\Services\SitePresenter;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Dashboard → Tables: set up tables and their QR codes, and run the live table board. */
class TablesController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly DineIn $dineIn,
    ) {}

    /** All tables with their QR links (for the setup list and the printable QR sheet). */
    public function index(SitePresenter $site): JsonResponse
    {
        $base = rtrim(str_replace('{host}', $site->primaryHost($this->context->require()), (string) config('dinedesk.site_url_pattern')), '/');

        return $this->ok([
            'tables' => DiningTable::orderBy('sort_order')->orderBy('id')->get()->map(fn (DiningTable $t) => $this->row($t, $base))->values(),
            'business' => $this->context->require()->name,
        ]);
    }

    public function store(Request $request, SitePresenter $site): JsonResponse
    {
        $data = $this->validated($request);
        $table = DiningTable::create($data + ['sort_order' => (int) DiningTable::max('sort_order') + 1]);
        AuditLog::record('table.created', $table, ['label' => $table->label]);
        $this->dineIn->emit($table->id);

        return $this->created($this->row($table, $this->base($site)), 'Table added.');
    }

    public function update(Request $request, int $id, SitePresenter $site): JsonResponse
    {
        $table = DiningTable::findOrFail($id);
        $table->update($this->validated($request, $table->id));
        $this->dineIn->emit($table->id);

        return $this->ok($this->row($table, $this->base($site)), 'Saved.');
    }

    public function destroy(int $id): JsonResponse
    {
        $table = DiningTable::findOrFail($id);
        if (TableSession::where('dining_table_id', $id)->where('status', 'open')->exists()) {
            throw new ApiException('This table has a running bill. Close it before removing the table.', 422, 'table_in_use');
        }
        $table->delete();
        AuditLog::record('table.deleted', $table, ['label' => $table->label]);
        $this->dineIn->emit($table->id);

        return $this->ok(null, 'Table removed.');
    }

    /** New QR code: the old printed one stops working (e.g. a lost or copied sticker). */
    public function regenerate(int $id, SitePresenter $site): JsonResponse
    {
        $table = DiningTable::findOrFail($id);
        $table->update(['qr_token' => DiningTable::newToken()]);
        AuditLog::record('table.qr_regenerated', $table, ['label' => $table->label]);

        return $this->ok($this->row($table, $this->base($site)), 'New QR code created. Print and replace the old one.');
    }

    public function live(): JsonResponse
    {
        return $this->ok(['tables' => $this->dineIn->live()]);
    }

    /** Open waiter / bill requests since `after` (for the alert sound). */
    public function feed(Request $request): JsonResponse
    {
        $after = (int) $request->query('after', 0);
        $open = TableRequest::with('table')->whereNull('resolved_at')->where('created_at', '>', now()->subHours(6));

        return $this->ok([
            'latest_id' => (int) TableRequest::max('id'),
            'new' => (clone $open)->where('id', '>', $after)->orderBy('id')->limit(20)->get()
                ->map(fn (TableRequest $r) => ['id' => $r->id, 'type' => $r->type, 'table' => $r->table?->label])->values(),
            'open' => (clone $open)->count(),
        ]);
    }

    public function bill(int $sessionId): JsonResponse
    {
        return $this->ok($this->dineIn->bill(TableSession::findOrFail($sessionId)));
    }

    public function close(Request $request, int $sessionId): JsonResponse
    {
        $data = $request->validate(['payment_mode' => ['required', Rule::in(DineIn::PAYMENT_MODES)]]);
        $session = $this->dineIn->close(TableSession::findOrFail($sessionId), $data['payment_mode'], $request->user());

        return $this->ok(['session_id' => $session->id, 'total' => $session->total], 'Table closed.');
    }

    /** Floor plan: positions and shapes of the tables. */
    public function layout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tables' => ['required', 'array', 'max:300'],
            'tables.*.id' => ['required', 'integer', Rule::exists('dining_tables', 'id')->where('tenant_id', $this->context->id())],
            'tables.*.x' => ['required', 'integer', 'min:0', 'max:2000'],
            'tables.*.y' => ['required', 'integer', 'min:0', 'max:2000'],
            'tables.*.shape' => ['required', Rule::in(['square', 'round', 'long'])],
        ]);
        $this->dineIn->saveLayout($data['tables']);

        return $this->ok(null, 'Floor plan saved.');
    }

    public function clean(int $id): JsonResponse
    {
        $this->dineIn->markClean(DiningTable::findOrFail($id));

        return $this->ok(null);
    }

    /** Move guests (and their bill) to a free table. */
    public function transfer(Request $request, int $sessionId): JsonResponse
    {
        $data = $request->validate(['table_id' => ['required', 'integer']]);
        $this->dineIn->transfer(TableSession::findOrFail($sessionId), DiningTable::findOrFail($data['table_id']), $request->user());

        return $this->ok(null, 'Table changed.');
    }

    /** Join another table's bill into this one. */
    public function merge(Request $request, int $sessionId): JsonResponse
    {
        $data = $request->validate(['session_id' => ['required', 'integer']]);
        $this->dineIn->merge(TableSession::findOrFail($sessionId), TableSession::findOrFail($data['session_id']), $request->user());

        return $this->ok(null, 'Tables merged.');
    }

    public function resolveRequest(Request $request, int $id): JsonResponse
    {
        $this->dineIn->resolveRequest(TableRequest::findOrFail($id), $request->user());

        return $this->ok(null);
    }

    private function validated(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'label' => ['required', 'string', 'max:40', Rule::unique('dining_tables', 'label')->where('tenant_id', $this->context->id())->whereNull('deleted_at')->ignore($ignoreId)],
            'seats' => ['required', 'integer', 'min:1', 'max:40'],
            'area' => ['nullable', 'string', 'max:60'],
            'is_active' => ['boolean'],
        ], ['label.unique' => 'Another table already has this name.']);
        $data['label'] = strip_tags($data['label']);
        $data['area'] = isset($data['area']) && $data['area'] !== '' ? strip_tags($data['area']) : null;

        return $data;
    }

    private function base(SitePresenter $site): string
    {
        return rtrim(str_replace('{host}', $site->primaryHost($this->context->require()), (string) config('dinedesk.site_url_pattern')), '/');
    }

    private function row(DiningTable $t, string $base): array
    {
        return [
            'id' => $t->id,
            'label' => $t->label,
            'seats' => $t->seats,
            'area' => $t->area,
            'is_active' => $t->is_active,
            'sort_order' => $t->sort_order,
            'pos_x' => $t->pos_x,
            'pos_y' => $t->pos_y,
            'shape' => $t->shape,
            'qr_url' => "{$base}/t/{$t->qr_token}",
        ];
    }
}
