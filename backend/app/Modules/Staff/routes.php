<?php

use App\Modules\Staff\Http\Controllers\RotaController;
use Illuminate\Support\Facades\Route;

// Everyone clocks themselves in and out.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api'])->prefix('tenant/attendance')->group(function () {
    Route::get('me', [RotaController::class, 'me']);
    Route::post('clock', [RotaController::class, 'clock']);
});

// The rota and attendance records: owner and managers.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:staff.schedule'])->prefix('tenant')->group(function () {
    Route::get('shifts', [RotaController::class, 'week']);
    Route::post('shifts', [RotaController::class, 'store']);
    Route::post('shifts/copy-week', [RotaController::class, 'copyWeek']);
    Route::put('shifts/{id}', [RotaController::class, 'update'])->whereNumber('id');
    Route::delete('shifts/{id}', [RotaController::class, 'destroy'])->whereNumber('id');
    Route::get('attendance', [RotaController::class, 'report']);
    Route::post('attendance', [RotaController::class, 'saveEntry']);
    Route::put('attendance/{id}', [RotaController::class, 'saveEntry'])->whereNumber('id');
    Route::delete('attendance/{id}', [RotaController::class, 'destroyEntry'])->whereNumber('id');
});
