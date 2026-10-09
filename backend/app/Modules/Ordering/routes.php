<?php

use App\Modules\Ordering\Http\Controllers\OrderingSettingsController;
use App\Modules\Ordering\Http\Controllers\OrdersController;
use App\Modules\Ordering\Http\Controllers\PublicOrderController;
use App\Modules\Ordering\Http\Controllers\RazorpayWebhookController;
use Illuminate\Support\Facades\Route;

// Customers on a business website (tenant from host)
Route::middleware(['tenant.host', 'feature:online_ordering'])->prefix('site/orders')->group(function () {
    Route::post('quote', [PublicOrderController::class, 'quote'])->middleware('throttle:api');
    Route::post('/', [PublicOrderController::class, 'store'])->middleware('throttle:orders');
    Route::get('{publicId}', [PublicOrderController::class, 'show'])->middleware('throttle:api');
    Route::post('{publicId}/payment', [PublicOrderController::class, 'verifyPayment'])->middleware('throttle:api');
});

// Razorpay → us (signature-verified per business)
Route::post('webhooks/razorpay/{tenant}', RazorpayWebhookController::class)->middleware('throttle:webhooks');

// Dashboard → Orders
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant')->group(function () {
    Route::middleware('tenant.can:orders.view')->group(function () {
        Route::get('orders', [OrdersController::class, 'index']);
        Route::get('orders/feed', [OrdersController::class, 'feed']);
        Route::get('orders/{id}', [OrdersController::class, 'show'])->whereNumber('id');
        Route::post('notifications/read', [OrdersController::class, 'markNotificationsRead']);
    });
    Route::post('orders/{id}/status', [OrdersController::class, 'transition'])->whereNumber('id')->middleware('tenant.can:orders.manage');

    Route::middleware('tenant.can:business.manage')->prefix('ordering')->group(function () {
        Route::get('/', [OrderingSettingsController::class, 'show']);
        Route::put('/', [OrderingSettingsController::class, 'update']);
        Route::put('razorpay', [OrderingSettingsController::class, 'updateRazorpay']);
        Route::post('zones', [OrderingSettingsController::class, 'storeZone']);
        Route::put('zones/{id}', [OrderingSettingsController::class, 'updateZone'])->whereNumber('id');
        Route::delete('zones/{id}', [OrderingSettingsController::class, 'destroyZone'])->whereNumber('id');
    });
});
