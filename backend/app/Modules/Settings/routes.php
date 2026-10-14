<?php

use App\Modules\Settings\Http\Controllers\BusinessController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:business.manage'])
    ->prefix('tenant/business')
    ->group(function () {
        Route::get('/', [BusinessController::class, 'show']);
        Route::put('/', [BusinessController::class, 'update']);
        Route::put('get-started', [BusinessController::class, 'getStarted']);
    });
