<?php

use App\Modules\Onboarding\Http\Controllers\OnboardingController;
use App\Modules\Onboarding\Http\Controllers\SiteSetupController;
use App\Modules\Onboarding\Http\Controllers\TryDemoController;
use Illuminate\Support\Facades\Route;

// "Try live demo" on the website: a sample business on a new account, signed in at once.
Route::post('auth/demo', TryDemoController::class)->middleware('throttle:demo');

Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('onboarding')->group(function () {
    // Steps 2–3: creates the business
    Route::post('business', [OnboardingController::class, 'store']);

    // Steps 4–7: website setup and go live (owner only)
    Route::middleware(['tenant.user', 'tenant.can:business.manage'])->group(function () {
        Route::put('theme', [SiteSetupController::class, 'theme']);
        Route::put('branding', [SiteSetupController::class, 'branding']);
        Route::post('menu', [SiteSetupController::class, 'menu']);
        Route::get('subdomain', [SiteSetupController::class, 'subdomain']);
        Route::post('go-live', [SiteSetupController::class, 'goLive']);
    });
});
