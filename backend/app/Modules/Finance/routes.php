<?php

use App\Modules\Finance\Http\Controllers\FinanceController;
use Illuminate\Support\Facades\Route;

// Profit and loss, expenses, dish costing: for whoever sees the business's numbers.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:reports.view'])->prefix('tenant/finance')->group(function () {
    Route::get('pnl', [FinanceController::class, 'pnl']);
    Route::get('dish-costs', [FinanceController::class, 'dishCosts']);
    Route::get('expenses', [FinanceController::class, 'expenses']);
    Route::post('expenses', [FinanceController::class, 'store']);
    Route::put('expenses/{id}', [FinanceController::class, 'update'])->whereNumber('id');
    Route::delete('expenses/{id}', [FinanceController::class, 'destroy'])->whereNumber('id');
});
