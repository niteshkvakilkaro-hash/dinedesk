<?php

use App\Modules\Accounts\Http\Controllers\GuestAccountController;
use Illuminate\Support\Facades\Route;

// Guests on a business website: sign in with phone + SMS code (tenant from host).
Route::middleware(['tenant.host'])->prefix('site/account')->group(function () {
    Route::post('code', [GuestAccountController::class, 'code'])->middleware('throttle:loyalty-code');
    Route::post('verify', [GuestAccountController::class, 'verify'])->middleware('throttle:booking-lookup');
    Route::get('/', [GuestAccountController::class, 'show'])->middleware('throttle:api');
    Route::put('/', [GuestAccountController::class, 'update'])->middleware('throttle:api');
    Route::post('sign-out', [GuestAccountController::class, 'signOut'])->middleware('throttle:api');
});
