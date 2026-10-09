<?php

use App\Modules\Onboarding\Http\Controllers\OnboardingController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('onboarding')->group(function () {
    Route::post('business', [OnboardingController::class, 'store']);
});
