<?php

use App\Modules\Inventory\Http\Controllers\InventoryController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'feature:inventory', 'tenant.can:inventory.manage'])->prefix('tenant/inventory')->group(function () {
    Route::get('items', [InventoryController::class, 'index']);
    Route::post('items', [InventoryController::class, 'store']);
    Route::put('items/{id}', [InventoryController::class, 'update'])->whereNumber('id');
    Route::delete('items/{id}', [InventoryController::class, 'destroy'])->whereNumber('id');
    Route::post('items/{id}/stock', [InventoryController::class, 'move'])->whereNumber('id');
    Route::get('items/{id}/movements', [InventoryController::class, 'movements'])->whereNumber('id');
    Route::get('recipes', [InventoryController::class, 'recipes']);
    Route::put('recipes/{menuItemId}', [InventoryController::class, 'saveRecipe'])->whereNumber('menuItemId');
});
