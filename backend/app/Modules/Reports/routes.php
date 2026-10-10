<?php

use App\Modules\Reports\Http\Controllers\ReportsController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:reports.view'])->prefix('tenant/reports')->group(function () {
    Route::get('overview', [ReportsController::class, 'overview']);
    Route::get('export/{type}', [ReportsController::class, 'export']);
});
