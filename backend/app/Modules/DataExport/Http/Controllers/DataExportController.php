<?php

namespace App\Modules\DataExport\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\DataExport\Jobs\ExportTenantData;
use App\Modules\DataExport\Models\DataExport;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Owner: download all business data (also while read-only). Super admin: the same for any business. */
class DataExportController extends Controller
{
    public function __construct(private readonly TenantContext $context) {}

    public function index(): JsonResponse
    {
        return $this->ok(DataExport::orderByDesc('id')->limit(10)->get()->map(fn (DataExport $e) => $this->row($e))->values());
    }

    public function store(Request $request): JsonResponse
    {
        if (DataExport::where('status', 'queued')->where('created_at', '>', now()->subMinutes(15))->exists()) {
            throw new ApiException('An export is already being prepared.', 422, 'export_running');
        }
        $tenant = $this->context->require();
        $export = $this->queue($tenant, $request->user()->id);

        return $this->created($this->row($export->fresh()), 'Preparing your export. This can take a few minutes.');
    }

    public function download(string $id): BinaryFileResponse
    {
        return $this->file(DataExport::where('public_id', $id)->firstOrFail());
    }

    public function platformStore(Request $request, string $publicId): JsonResponse
    {
        $tenant = Tenant::where('public_id', $publicId)->firstOrFail();
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:255']]);
        $export = $this->context->run($tenant, fn () => $this->queue($tenant, $request->user()->id, $data['reason']));

        return $this->created($this->row(DataExport::withoutTenancy()->find($export->id)));
    }

    public function platformDownload(string $id): BinaryFileResponse
    {
        return $this->file(DataExport::withoutTenancy()->where('public_id', $id)->firstOrFail());
    }

    private function queue(Tenant $tenant, int $userId, ?string $reason = null): DataExport
    {
        $export = DataExport::create(['requested_by' => $userId, 'status' => 'queued']);
        AuditLog::record('data.export_requested', $export, array_filter(['reason' => $reason]), $tenant->id);
        ExportTenantData::dispatch($tenant->id, $export->id);

        return $export;
    }

    private function file(DataExport $e): BinaryFileResponse
    {
        if ($e->status !== 'ready' || ! $e->path || ($e->expires_at && $e->expires_at->isPast()) || ! Storage::disk('local')->exists($e->path)) {
            throw new ApiException('This export is not available (it may have expired).', 404, 'not_found');
        }
        AuditLog::record('data.export_downloaded', $e, [], $e->tenant_id);

        return response()->download(Storage::disk('local')->path($e->path), 'export-'.$e->created_at->format('Y-m-d').'.zip', ['Cache-Control' => 'no-store, private']);
    }

    private function row(DataExport $e): array
    {
        return ['id' => $e->public_id, 'status' => $e->status, 'size' => $e->size, 'error' => $e->error, 'created_at' => $e->created_at->toIso8601String(), 'expires_at' => $e->expires_at?->toIso8601String()];
    }
}
