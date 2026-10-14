<?php

use App\Modules\Notify\Http\Controllers\InAppAlertController;
use App\Modules\Notify\Http\Controllers\PushController;
use Illuminate\Support\Facades\Route;

// Push alerts on staff phones / browsers (each person's own devices).
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant/push')->group(function () {
    Route::get('/', [PushController::class, 'show']);
    Route::post('subscribe', [PushController::class, 'subscribe']);
    Route::post('unsubscribe', [PushController::class, 'unsubscribe']);
    Route::post('test', [PushController::class, 'test'])->middleware('throttle:otp-send');
});

// In-app alerts on the dashboard (each person's own). Dismissing works while read-only too.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant/alerts')->group(function () {
    Route::get('/', [InAppAlertController::class, 'index']);
    Route::post('{id}/read', [InAppAlertController::class, 'read'])->whereUuid('id')->name('saas.alerts.read');
});
