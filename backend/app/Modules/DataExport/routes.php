<?php

use App\Modules\DataExport\Http\Controllers\DataExportController;
use Illuminate\Support\Facades\Route;

// Named data.* so owners can take their data out while the business is read-only.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:business.manage'])->prefix('tenant/exports')->name('data.')->group(function () {
    Route::get('/', [DataExportController::class, 'index'])->name('index');
    Route::post('/', [DataExportController::class, 'store'])->middleware('throttle:exports')->name('store');
    Route::get('{id}', [DataExportController::class, 'download'])->name('download');
});
