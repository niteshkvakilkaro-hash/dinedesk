<?php

use App\Modules\DataExport\Http\Controllers\DataExportController;
use App\Modules\Platform\Http\Controllers\IntegrationController;
use App\Modules\Platform\Http\Controllers\PlatformPlanController;
use App\Modules\Platform\Http\Controllers\PlatformSettingsController;
use App\Modules\Platform\Http\Controllers\RevenueController;
use App\Modules\Platform\Http\Controllers\SupportController;
use App\Modules\Platform\Http\Controllers\TenantController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'platform.admin', 'throttle:api'])->prefix('platform')->group(function () {
    Route::get('tenants', [TenantController::class, 'index']);
    Route::get('tenants/{publicId}', [TenantController::class, 'show']);
    Route::patch('tenants/{publicId}', [TenantController::class, 'update']);
    Route::post('tenants/{publicId}/feature-overrides', [TenantController::class, 'storeOverride']);
    Route::delete('tenants/{publicId}/feature-overrides/{feature}', [TenantController::class, 'destroyOverride']);
    Route::post('tenants/{publicId}/support', [SupportController::class, 'start'])->middleware('throttle:support');
    Route::get('tenants/{publicId}/support', [SupportController::class, 'index']);
    Route::post('tenants/{publicId}/export', [DataExportController::class, 'platformStore']);
    Route::get('exports/{id}', [DataExportController::class, 'platformDownload']);

    Route::get('plans', [PlatformPlanController::class, 'index']);
    Route::put('plans/{code}', [PlatformPlanController::class, 'update']);

    Route::get('revenue', RevenueController::class);
    Route::get('settings', [PlatformSettingsController::class, 'show']);
    Route::put('settings', [PlatformSettingsController::class, 'update']);

    // Integrations: the platform's own keys (Razorpay, AI, WhatsApp, SMS, email, web push).
    Route::get('integrations', [IntegrationController::class, 'show']);
    Route::post('integrations/webpush/generate', [IntegrationController::class, 'generateVapid']);
    Route::put('integrations/{integration}', [IntegrationController::class, 'update']);
    Route::post('integrations/{integration}/test', [IntegrationController::class, 'test'])->middleware('throttle:integration-test');
});

// The support token itself ends its session (it can't reach the platform routes above).
Route::middleware(['auth:sanctum', 'throttle:api'])->post('support/end', [SupportController::class, 'end']);
