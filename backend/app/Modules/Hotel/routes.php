<?php

use App\Modules\Hotel\Http\Controllers\FrontDeskController;
use App\Modules\Hotel\Http\Controllers\HotelSetupController;
use App\Modules\Hotel\Http\Controllers\HousekeepingController;
use App\Modules\Hotel\Http\Controllers\PublicHotelController;
use Illuminate\Support\Facades\Route;

// Guests on a hotel's website (tenant from host)
Route::middleware(['tenant.host', 'feature:hotel'])->prefix('site/hotel')->group(function () {
    Route::get('/', [PublicHotelController::class, 'rooms'])->middleware('throttle:api');
    Route::get('availability', [PublicHotelController::class, 'availability'])->middleware('throttle:api');
    Route::post('bookings', [PublicHotelController::class, 'store'])->middleware('throttle:reservations');
    Route::post('bookings/lookup', [PublicHotelController::class, 'lookup'])->middleware('throttle:booking-lookup');
    Route::get('bookings/{publicId}', [PublicHotelController::class, 'show'])->middleware('throttle:api');
    Route::post('bookings/{publicId}/pay', [PublicHotelController::class, 'pay'])->middleware('throttle:reservations');
    Route::post('bookings/{publicId}/verify-payment', [PublicHotelController::class, 'verifyPayment'])->middleware('throttle:api');
    Route::post('bookings/{publicId}/cancel', [PublicHotelController::class, 'cancel'])->middleware('throttle:booking-lookup');
    Route::get('rooms/{token}', [PublicHotelController::class, 'room'])->middleware('throttle:api');
    Route::post('banquets', [PublicHotelController::class, 'enquire'])->middleware('throttle:reservations');
});

// Dashboard → Hotel
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:hotel'])->prefix('tenant/hotel')->group(function () {
    Route::middleware('tenant.can:rooms.manage')->group(function () {
        Route::get('today', [FrontDeskController::class, 'today']);
        Route::get('calendar', [FrontDeskController::class, 'calendar']);
        Route::get('availability', [FrontDeskController::class, 'availability']);
        Route::get('bookings', [FrontDeskController::class, 'index']);
        Route::post('bookings', [FrontDeskController::class, 'store']);
        Route::get('bookings/{id}', [FrontDeskController::class, 'show'])->whereNumber('id');
        Route::put('bookings/{id}', [FrontDeskController::class, 'update'])->whereNumber('id');
        Route::post('bookings/{id}/status', [FrontDeskController::class, 'transition'])->whereNumber('id');
        Route::put('bookings/{id}/room', [FrontDeskController::class, 'assignRoom'])->whereNumber('id');
        Route::post('bookings/{id}/check-in', [FrontDeskController::class, 'checkIn'])->whereNumber('id');
        Route::put('bookings/{id}/dates', [FrontDeskController::class, 'dates'])->whereNumber('id');
        Route::put('bookings/{id}/rate', [FrontDeskController::class, 'rate'])->whereNumber('id');
        Route::post('bookings/{id}/check-out', [FrontDeskController::class, 'checkOut'])->whereNumber('id');
        Route::get('bookings/{id}/invoice', [FrontDeskController::class, 'invoice'])->whereNumber('id');
        Route::post('bookings/{id}/charges', [FrontDeskController::class, 'addCharge'])->whereNumber('id');
        Route::post('bookings/{id}/charges/{itemId}/void', [FrontDeskController::class, 'voidCharge'])->whereNumber(['id', 'itemId']);
        Route::post('bookings/{id}/payments', [FrontDeskController::class, 'addPayment'])->whereNumber('id');
        Route::post('bookings/{id}/documents', [FrontDeskController::class, 'uploadDocument'])->whereNumber('id');
        Route::get('documents/{docId}', [FrontDeskController::class, 'document'])->whereNumber('docId');
        Route::delete('documents/{docId}', [FrontDeskController::class, 'deleteDocument'])->whereNumber('docId');
        Route::get('banquets', [FrontDeskController::class, 'banquets']);
        Route::put('banquets/{id}', [FrontDeskController::class, 'updateBanquet'])->whereNumber('id');
    });
    Route::middleware('tenant.can:housekeeping.update')->group(function () {
        Route::get('housekeeping', [HousekeepingController::class, 'board']);
        Route::post('rooms/{id}/housekeeping', [HousekeepingController::class, 'update'])->whereNumber('id');
        Route::get('rooms/{id}/housekeeping', [HousekeepingController::class, 'log'])->whereNumber('id');
    });
    Route::middleware('tenant.can:rooms.setup')->group(function () {
        Route::get('types', [HotelSetupController::class, 'types']);
        Route::post('types', [HotelSetupController::class, 'storeType']);
        Route::put('types/{id}', [HotelSetupController::class, 'updateType'])->whereNumber('id');
        Route::delete('types/{id}', [HotelSetupController::class, 'destroyType'])->whereNumber('id');
        Route::post('types/{id}/photos', [HotelSetupController::class, 'addPhoto'])->whereNumber('id');
        Route::match(['put', 'delete'], 'types/{id}/photos/{key}', [HotelSetupController::class, 'photo'])->whereNumber(['id', 'key']);
        Route::post('types/{id}/rates', [HotelSetupController::class, 'storeRate'])->whereNumber('id');
        Route::put('rates/{rateId}', [HotelSetupController::class, 'updateRate'])->whereNumber('rateId');
        Route::delete('rates/{rateId}', [HotelSetupController::class, 'destroyRate'])->whereNumber('rateId');
        Route::get('rooms', [HotelSetupController::class, 'rooms']);
        Route::post('rooms', [HotelSetupController::class, 'storeRooms']);
        Route::put('rooms/{id}', [HotelSetupController::class, 'updateRoom'])->whereNumber('id');
        Route::delete('rooms/{id}', [HotelSetupController::class, 'destroyRoom'])->whereNumber('id');
        Route::post('rooms/{id}/qr', [HotelSetupController::class, 'regenerateQr'])->whereNumber('id');
        Route::get('settings', [HotelSetupController::class, 'settings']);
        Route::put('settings', [HotelSetupController::class, 'updateSettings']);
    });
});
