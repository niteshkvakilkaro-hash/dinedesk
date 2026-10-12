<?php

use App\Modules\Marketing\Http\Controllers\MarketingController;
use Illuminate\Support\Facades\Route;

// Dashboard → Marketing (coupons, banners, campaigns: the Growth marketing bundle)
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:coupons', 'tenant.can:marketing.manage'])->prefix('tenant/marketing')->group(function () {
    Route::get('coupons', [MarketingController::class, 'coupons']);
    Route::post('coupons', [MarketingController::class, 'storeCoupon']);
    Route::put('coupons/{id}', [MarketingController::class, 'updateCoupon'])->whereNumber('id');
    Route::delete('coupons/{id}', [MarketingController::class, 'destroyCoupon'])->whereNumber('id');

    Route::get('banners', [MarketingController::class, 'banners']);
    Route::post('banners', [MarketingController::class, 'storeBanner']);
    Route::put('banners/{id}', [MarketingController::class, 'updateBanner'])->whereNumber('id');
    Route::delete('banners/{id}', [MarketingController::class, 'destroyBanner'])->whereNumber('id');

    Route::get('campaigns', [MarketingController::class, 'campaigns']);
    Route::post('campaigns/audience', [MarketingController::class, 'audience']);
    Route::post('campaigns', [MarketingController::class, 'send'])->middleware('throttle:campaigns');

    Route::get('automations', [MarketingController::class, 'automations']);
    Route::put('automations', [MarketingController::class, 'updateAutomations']);
});
