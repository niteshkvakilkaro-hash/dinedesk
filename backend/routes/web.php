<?php

use App\Modules\Website\Http\Controllers\SeoController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Per-business SEO files (the host decides which business).
Route::get('robots.txt', [SeoController::class, 'robots']);
Route::get('sitemap.xml', [SeoController::class, 'sitemap']);

// Each business website installs as its own app (manifest + icons from its logo and colours).
Route::get('site.webmanifest', [\App\Modules\Website\Http\Controllers\SiteAppController::class, 'manifest']);
Route::get('site-icon-{size}.png', [\App\Modules\Website\Http\Controllers\SiteAppController::class, 'icon'])->whereNumber('size');
