<?php

use App\Modules\Kitchen\Http\Controllers\KitchenController;
use Illuminate\Support\Facades\Route;

// Kitchen Display System
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:kds', 'tenant.can:kot.update'])->prefix('tenant/kitchen')->group(function () {
    Route::get('tickets', [KitchenController::class, 'index']);
    Route::post('tickets/{id}/status', [KitchenController::class, 'move'])->whereNumber('id');
    Route::post('items/{id}/toggle', [KitchenController::class, 'toggleItem'])->whereNumber('id');
});
