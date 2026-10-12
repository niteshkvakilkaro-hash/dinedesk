<?php

use App\Modules\Inventory\Http\Controllers\InventoryController;
use App\Modules\Inventory\Http\Controllers\PurchasingController;
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

    // Suppliers and purchase orders
    Route::get('suppliers', [PurchasingController::class, 'suppliers']);
    Route::post('suppliers', [PurchasingController::class, 'saveSupplier']);
    Route::put('suppliers/{id}', [PurchasingController::class, 'saveSupplier'])->whereNumber('id');
    Route::get('purchase-orders', [PurchasingController::class, 'orders']);
    Route::get('purchase-orders/suggestions', [PurchasingController::class, 'suggestions']);
    Route::post('purchase-orders', [PurchasingController::class, 'saveOrder']);
    Route::put('purchase-orders/{id}', [PurchasingController::class, 'saveOrder'])->whereNumber('id');
    Route::post('purchase-orders/{id}/send', [PurchasingController::class, 'send'])->whereNumber('id');
    Route::post('purchase-orders/{id}/receive', [PurchasingController::class, 'receive'])->whereNumber('id');
    Route::post('purchase-orders/{id}/cancel', [PurchasingController::class, 'cancel'])->whereNumber('id');
});
