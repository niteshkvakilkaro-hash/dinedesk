<?php

use App\Modules\Reservations\Http\Controllers\PublicReservationController;
use App\Modules\Reservations\Http\Controllers\ReservationsController;
use Illuminate\Support\Facades\Route;

// Guests on a business website (tenant from host)
Route::middleware(['tenant.host', 'feature:reservations'])->prefix('site/reservations')->group(function () {
    Route::get('availability', [PublicReservationController::class, 'availability'])->middleware('throttle:api');
    Route::post('/', [PublicReservationController::class, 'store'])->middleware('throttle:reservations');
    Route::post('lookup', [PublicReservationController::class, 'lookup'])->middleware('throttle:booking-lookup');
    Route::post('cancel', [PublicReservationController::class, 'cancel'])->middleware('throttle:booking-lookup');
});

// Dashboard → Reservations
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:reservations', 'tenant.can:reservations.manage'])->prefix('tenant/reservations')->group(function () {
    Route::get('/', [ReservationsController::class, 'index']);
    Route::get('feed', [ReservationsController::class, 'feed']);
    Route::get('availability', [ReservationsController::class, 'availability']);
    Route::post('/', [ReservationsController::class, 'store']);
    Route::post('{id}/status', [ReservationsController::class, 'transition'])->whereNumber('id');
    Route::put('{id}/table', [ReservationsController::class, 'assignTable'])->whereNumber('id');
    Route::get('settings', [ReservationsController::class, 'settings']);
    Route::put('settings', [ReservationsController::class, 'updateSettings']);
    Route::put('slots', [ReservationsController::class, 'updateSlots']);
});
