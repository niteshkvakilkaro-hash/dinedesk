<?php

use App\Modules\Crm\Http\Controllers\CustomersController;
use App\Modules\Crm\Http\Controllers\PublicGrowthController;
use Illuminate\Support\Facades\Route;

// Guests on a business website (tenant from host)
Route::middleware(['tenant.host'])->prefix('site')->group(function () {
    Route::get('orders/{publicId}/feedback', [PublicGrowthController::class, 'feedbackStatus'])->middleware('throttle:api');
    Route::post('orders/{publicId}/feedback', [PublicGrowthController::class, 'submitFeedback'])->middleware('throttle:booking-lookup');
    Route::post('loyalty/code', [PublicGrowthController::class, 'loyaltyCode'])->middleware('throttle:loyalty-code');
    Route::post('loyalty/verify', [PublicGrowthController::class, 'loyaltyVerify'])->middleware('throttle:booking-lookup');
    Route::get('offers', [PublicGrowthController::class, 'offers'])->middleware('throttle:api');
    Route::post('unsubscribe', [PublicGrowthController::class, 'unsubscribe'])->middleware('throttle:booking-lookup');
});

// Dashboard → Customers and Feedback
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:customers.view'])->prefix('tenant')->group(function () {
    Route::get('customers', [CustomersController::class, 'index']);
    Route::get('customers/lookup', [CustomersController::class, 'lookup']);
    Route::get('customers/{id}', [CustomersController::class, 'show'])->whereNumber('id');
    Route::put('customers/{id}', [CustomersController::class, 'update'])->whereNumber('id');
    Route::get('feedback', [CustomersController::class, 'feedback']);
    Route::put('feedback/{id}', [CustomersController::class, 'updateFeedback'])->whereNumber('id');
});
