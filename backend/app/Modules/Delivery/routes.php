<?php

use App\Modules\Delivery\Http\Controllers\RiderController;
use App\Modules\Delivery\Http\Controllers\RidersController;
use Illuminate\Support\Facades\Route;

// The rider's own screen (/rider/) and their phone's location batches.
Route::middleware(['auth:sanctum', 'tenant.user', 'tenant.can:deliveries.run', 'feature:online_ordering'])->prefix('tenant/rider')->group(function () {
    Route::middleware('throttle:api')->group(function () {
        Route::get('/', [RiderController::class, 'show']);
        Route::post('duty', [RiderController::class, 'duty']);
        Route::post('orders/{id}/status', [RiderController::class, 'status'])->whereNumber('id');
    });
    // The only route the app's background upload token (Riders::TOKEN_NAME) may call.
    Route::post('locations', [RiderController::class, 'locations'])->middleware('throttle:rider-locations')->name('rider.locations');
});

// Dashboard → Riders: owner, manager, cashier.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:orders.manage', 'feature:online_ordering'])->prefix('tenant')->group(function () {
    Route::get('riders', [RidersController::class, 'index']);
    Route::get('riders/{id}/trail', [RidersController::class, 'trail'])->whereNumber('id');
    Route::post('orders/{id}/rider', [RidersController::class, 'assign'])->whereNumber('id');
});
