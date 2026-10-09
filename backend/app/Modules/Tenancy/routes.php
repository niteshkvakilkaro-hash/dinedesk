<?php

use App\Modules\Tenancy\Http\Controllers\PublicSiteController;
use Illuminate\Support\Facades\Route;

// Public website (tenant from the visitor's host)
Route::middleware(['tenant.host', 'throttle:api'])->group(function () {
    Route::get('site', [PublicSiteController::class, 'show']);
});
