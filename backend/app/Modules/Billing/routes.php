<?php

use App\Modules\Billing\Http\Controllers\AppOrdersController;
use App\Modules\Billing\Http\Controllers\BillingController;
use App\Modules\Billing\Http\Controllers\DayEndController;
use App\Modules\Billing\Http\Controllers\OfflinePosController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant')->group(function () {
    // Staff orders: the POS and the waiter app both send them to the kitchen.
    Route::middleware('tenant.can:orders.create')->group(function () {
        Route::get('pos/menu', [BillingController::class, 'menu']);
        Route::post('pos/orders', [BillingController::class, 'placeOrder']);
    });

    Route::middleware(['feature:pos', 'tenant.can:pos.use'])->group(function () {
        Route::get('pos/open', [BillingController::class, 'open']);
        // Offline POS: pricing kept on the device, and the sales it saved while offline.
        Route::get('pos/offline-pack', [OfflinePosController::class, 'pack']);
        Route::post('pos/offline-sync', [OfflinePosController::class, 'sync']);
        // Swiggy / Zomato orders entered at the counter.
        Route::post('pos/app-orders', [AppOrdersController::class, 'store']);
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

// GST for the month: GSTR-1 sections (CSV) and Tally Prime vouchers (XML), for the CA.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:reports.view'])->prefix('tenant/reports/gst')->group(function () {
    Route::get('/', [\App\Modules\Billing\Http\Controllers\GstController::class, 'show']);
    Route::get('export/{section}', [\App\Modules\Billing\Http\Controllers\GstController::class, 'export']);
});
