<?php

use App\Modules\Website\Http\Controllers\GalleryController;
use App\Modules\Website\Http\Controllers\PublicSiteController;
use App\Modules\Website\Http\Controllers\WebsiteController;
use Illuminate\Support\Facades\Route;

// Public website (tenant from the visitor's host)
Route::middleware(['tenant.host', 'throttle:api'])->prefix('site')->group(function () {
    Route::get('/', [PublicSiteController::class, 'show']);
    Route::get('menu', [PublicSiteController::class, 'menu']);
    Route::get('gallery', [PublicSiteController::class, 'gallery']);
});

// Dashboard → Website and Gallery
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:theme.manage', 'feature:website'])
    ->prefix('tenant')
    ->group(function () {
        Route::get('website', [WebsiteController::class, 'show']);
        Route::put('website/theme', [WebsiteController::class, 'updateTheme']);
        Route::put('website/content', [WebsiteController::class, 'updateContent']);
        Route::post('website/images/{slot}', [WebsiteController::class, 'uploadImage']);
        Route::delete('website/images/{slot}', [WebsiteController::class, 'deleteImage']);

        Route::get('gallery', [GalleryController::class, 'index']);
        Route::post('gallery', [GalleryController::class, 'store']);
        Route::put('gallery/order', [GalleryController::class, 'reorder']);
        Route::put('gallery/{id}', [GalleryController::class, 'update'])->whereNumber('id');
        Route::delete('gallery/{id}', [GalleryController::class, 'destroy'])->whereNumber('id');
    });
