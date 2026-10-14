<?php

use App\Modules\Identity\Http\Controllers\AccountController;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\StaffController;
use Illuminate\Support\Facades\Route;

// Sign-up / sign-in (onboarding step 1)
Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('otp/send', [AuthController::class, 'sendOtp'])->middleware('throttle:otp-send');
    Route::post('otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:otp-verify');

    Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

// My account (anyone signed in: owner, staff, super admin). User-level, not tenant-scoped.
Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('account')->group(function () {
    Route::patch('/', [AccountController::class, 'update']);
    Route::put('password', [AccountController::class, 'password']);
    Route::post('phone/code', [AccountController::class, 'phoneCode'])->middleware('throttle:otp-send');
    Route::post('phone/verify', [AccountController::class, 'phoneVerify'])->middleware('throttle:otp-verify');
});

// Business team (owner)
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:staff.manage'])
    ->prefix('tenant/staff')
    ->group(function () {
        Route::get('/', [StaffController::class, 'index']);
        Route::post('/', [StaffController::class, 'store']);
        Route::patch('{id}', [StaffController::class, 'update'])->whereNumber('id');
        Route::delete('{id}', [StaffController::class, 'destroy'])->whereNumber('id');
    });
