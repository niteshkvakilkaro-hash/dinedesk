<?php

namespace App\Modules\DataExport\Jobs;

use App\Modules\DataExport\Models\DataExport;
use App\Modules\DataExport\Services\TenantExporter;
use App\Modules\Tenancy\Models\Tenant;
use App\Modules\Tenancy\Support\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Str;

class ExportTenantData implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $timeout = 600;

    public function __construct(public readonly int $tenantId, public readonly int $exportId) {}

    public function handle(TenantExporter $exporter, TenantContext $context): void
    {
        $tenant = Tenant::findOrFail($this->tenantId);
        $context->run($tenant, function () use ($exporter, $tenant) {
            $export = DataExport::findOrFail($this->exportId);
            try {
                $exporter->build($tenant, $export);
            } catch (\Throwable $e) {
                report($e);
                $export->update(['status' => 'failed', 'error' => Str::limit($e->getMessage(), 250)]);
            }
        });
    }
}
