<?php

use App\Modules\Billing\Http\Controllers\BillingController;
use App\Modules\Billing\Http\Controllers\DayEndController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant')->group(function () {
    // Staff orders: the POS and the waiter app both send them to the kitchen.
    Route::middleware('tenant.can:orders.create')->group(function () {
        Route::get('pos/menu', [BillingController::class, 'menu']);
        Route::post('pos/orders', [BillingController::class, 'placeOrder']);
    });

    Route::middleware(['feature:pos', 'tenant.can:pos.use'])->group(function () {
        Route::get('pos/open', [BillingController::class, 'open']);
        Route::get('bills', [BillingController::class, 'index']);
        Route::post('bills', [BillingController::class, 'store']);
        Route::get('bills/{id}', [BillingController::class, 'show'])->whereNumber('id');
        Route::post('bills/{id}/pay', [BillingController::class, 'pay'])->whereNumber('id');
        Route::post('bills/{id}/void', [BillingController::class, 'void'])->whereNumber('id');
        Route::get('bills/{id}/pdf', [BillingController::class, 'pdf'])->whereNumber('id');

        Route::get('reports/day', [DayEndController::class, 'show']);
        Route::post('reports/day/close', [DayEndController::class, 'close']);
        Route::get('reports/day/pdf', [DayEndController::class, 'pdf']);
    });
});
