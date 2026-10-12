<?php

use App\Modules\Tiffin\Http\Controllers\PublicTiffinController;
use App\Modules\Tiffin\Http\Controllers\TiffinController;
use Illuminate\Support\Facades\Route;

// Guests on a business website (tenant from host)
Route::middleware(['tenant.host'])->prefix('site/tiffin')->group(function () {
    Route::get('plans', [PublicTiffinController::class, 'plans'])->middleware('throttle:api');
    Route::post('request', [PublicTiffinController::class, 'request'])->middleware('throttle:reservations');
});

// Dashboard → Tiffin: plans and prices with the menu; subscribers and deliveries with orders.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:menu.manage'])->prefix('tenant/tiffin')->group(function () {
    Route::post('plans', [TiffinController::class, 'savePlan']);
    Route::put('plans/{id}', [TiffinController::class, 'savePlan'])->whereNumber('id');
});
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:orders.manage'])->prefix('tenant/tiffin')->group(function () {
    Route::get('plans', [TiffinController::class, 'plans']);
    Route::get('subscriptions', [TiffinController::class, 'subscriptions']);
    Route::post('subscriptions', [TiffinController::class, 'store']);
    Route::put('subscriptions/{id}', [TiffinController::class, 'update'])->whereNumber('id');
    Route::post('subscriptions/{id}/activate', [TiffinController::class, 'activate'])->whereNumber('id');
    Route::post('subscriptions/{id}/renew', [TiffinController::class, 'renew'])->whereNumber('id');
    Route::post('subscriptions/{id}/pause', [TiffinController::class, 'pause'])->whereNumber('id');
    Route::post('subscriptions/{id}/resume', [TiffinController::class, 'resume'])->whereNumber('id');
    Route::post('subscriptions/{id}/cancel', [TiffinController::class, 'cancel'])->whereNumber('id');
    Route::post('subscriptions/{id}/mark', [TiffinController::class, 'mark'])->whereNumber('id');
    Route::get('day', [TiffinController::class, 'day']);
});
