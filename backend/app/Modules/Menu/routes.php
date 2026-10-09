<?php

use App\Modules\Menu\Http\Controllers\MenuController;
use Illuminate\Support\Facades\Route;

// Dashboard → Menu
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:menu.manage'])
    ->prefix('tenant/menu')
    ->group(function () {
        Route::get('/', [MenuController::class, 'index']);

        Route::post('categories', [MenuController::class, 'storeCategory']);
        Route::put('categories/order', [MenuController::class, 'reorderCategories']);
        Route::put('categories/{id}', [MenuController::class, 'updateCategory'])->whereNumber('id');
        Route::delete('categories/{id}', [MenuController::class, 'destroyCategory'])->whereNumber('id');
        Route::put('categories/{id}/items/order', [MenuController::class, 'reorderItems'])->whereNumber('id');

        Route::post('items', [MenuController::class, 'storeItem']);
        Route::put('items/{id}', [MenuController::class, 'updateItem'])->whereNumber('id');
        Route::delete('items/{id}', [MenuController::class, 'destroyItem'])->whereNumber('id');
        Route::patch('items/{id}/availability', [MenuController::class, 'availability'])->whereNumber('id');
        Route::post('items/{id}/image', [MenuController::class, 'uploadImage'])->whereNumber('id');
        Route::delete('items/{id}/image', [MenuController::class, 'deleteImage'])->whereNumber('id');

        Route::post('addon-groups', [MenuController::class, 'storeGroup']);
        Route::put('addon-groups/{id}', [MenuController::class, 'updateGroup'])->whereNumber('id');
        Route::delete('addon-groups/{id}', [MenuController::class, 'destroyGroup'])->whereNumber('id');

        Route::get('import/template', [MenuController::class, 'template']);
        Route::post('import', [MenuController::class, 'import']);
        Route::delete('demo', [MenuController::class, 'clearDemo']);
    });
