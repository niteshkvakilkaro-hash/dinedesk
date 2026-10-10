<?php

use App\Modules\Domains\Http\Controllers\DomainsController;
use Illuminate\Support\Facades\Route;

// Caddy on-demand TLS ("ask" endpoint)
Route::get('tls/ask', [DomainsController::class, 'ask'])->middleware('throttle:tls-ask');

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:business.manage'])->prefix('tenant/domains')->group(function () {
    Route::get('/', [DomainsController::class, 'index']);
    Route::post('/', [DomainsController::class, 'store']);
    Route::post('{id}/verify', [DomainsController::class, 'verify'])->whereNumber('id');
    Route::post('{id}/primary', [DomainsController::class, 'primary'])->whereNumber('id');
    Route::delete('{id}', [DomainsController::class, 'destroy'])->whereNumber('id');
});
