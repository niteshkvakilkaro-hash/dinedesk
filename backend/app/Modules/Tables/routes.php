<?php

use App\Modules\Tables\Http\Controllers\PublicTableController;
use App\Modules\Tables\Http\Controllers\TablesController;
use Illuminate\Support\Facades\Route;

// Guests at a table, from its QR code (tenant from host)
Route::middleware(['tenant.host', 'feature:qr_ordering'])->prefix('site/tables')->group(function () {
    Route::get('{token}', [PublicTableController::class, 'show'])->middleware('throttle:api');
    Route::post('{token}/requests', [PublicTableController::class, 'request'])->middleware('throttle:table-requests');
});

// Dashboard → Tables
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:qr_ordering'])->prefix('tenant/tables')->group(function () {
    Route::middleware('tenant.can:tables.manage')->group(function () {
        Route::get('live', [TablesController::class, 'live']);
        Route::get('feed', [TablesController::class, 'feed']);
        Route::get('sessions/{sessionId}', [TablesController::class, 'bill'])->whereNumber('sessionId');
        Route::post('sessions/{sessionId}/close', [TablesController::class, 'close'])->whereNumber('sessionId');
        Route::post('requests/{id}/done', [TablesController::class, 'resolveRequest'])->whereNumber('id');
        Route::post('{id}/clean', [TablesController::class, 'clean'])->whereNumber('id');
        Route::post('sessions/{sessionId}/transfer', [TablesController::class, 'transfer'])->whereNumber('sessionId');
        Route::post('sessions/{sessionId}/merge', [TablesController::class, 'merge'])->whereNumber('sessionId');
    });
    Route::middleware('tenant.can:tables.setup')->group(function () {
        Route::get('/', [TablesController::class, 'index']);
        Route::post('/', [TablesController::class, 'store']);
        Route::put('{id}', [TablesController::class, 'update'])->whereNumber('id');
        Route::delete('{id}', [TablesController::class, 'destroy'])->whereNumber('id');
        Route::post('{id}/qr', [TablesController::class, 'regenerate'])->whereNumber('id');
        Route::put('layout', [TablesController::class, 'layout']);
    });
});
