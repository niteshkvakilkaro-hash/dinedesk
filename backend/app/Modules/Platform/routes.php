<?php

use App\Modules\Platform\Http\Controllers\PlatformPlanController;
use App\Modules\Platform\Http\Controllers\TenantController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'platform.admin', 'throttle:api'])->prefix('platform')->group(function () {
    Route::get('tenants', [TenantController::class, 'index']);
    Route::get('tenants/{publicId}', [TenantController::class, 'show']);
    Route::patch('tenants/{publicId}', [TenantController::class, 'update']);
    Route::post('tenants/{publicId}/feature-overrides', [TenantController::class, 'storeOverride']);
    Route::delete('tenants/{publicId}/feature-overrides/{feature}', [TenantController::class, 'destroyOverride']);

    Route::get('plans', [PlatformPlanController::class, 'index']);
    Route::put('plans/{code}', [PlatformPlanController::class, 'update']);
});
