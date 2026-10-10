<?php

use App\Modules\Loyalty\Http\Controllers\LoyaltyController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:loyalty'])->prefix('tenant/loyalty')->group(function () {
    Route::middleware('tenant.can:marketing.manage')->group(function () {
        Route::get('/', [LoyaltyController::class, 'settings']);
        Route::put('/', [LoyaltyController::class, 'updateSettings']);
        Route::post('customers/{customerId}/adjust', [LoyaltyController::class, 'adjust'])->whereNumber('customerId');
        Route::get('gift-cards', [LoyaltyController::class, 'giftCards']);
        Route::post('gift-cards', [LoyaltyController::class, 'issue']);
        Route::get('gift-cards/{id}', [LoyaltyController::class, 'show'])->whereNumber('id');
        Route::post('gift-cards/{id}/void', [LoyaltyController::class, 'void'])->whereNumber('id');
    });
    // The counter checks a card before taking it as payment.
    Route::get('gift-cards/lookup', [LoyaltyController::class, 'lookup'])->middleware('tenant.can:pos.use');
});
