<?php

use App\Modules\Branches\Http\Controllers\BranchesController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant/branches')->group(function () {
    // Anyone with a role in another outlet of the business may switch to it (also while read-only).
    Route::post('{publicId}/switch', [BranchesController::class, 'switch'])->name('saas.branch-switch');
    Route::get('report', [BranchesController::class, 'report'])->middleware('tenant.can:reports.view');
    Route::middleware('tenant.can:business.manage')->group(function () {
        Route::get('/', [BranchesController::class, 'index']);
        Route::post('/', [BranchesController::class, 'store']);
        Route::post('{publicId}/copy-menu', [BranchesController::class, 'copyMenu']);
    });
});
