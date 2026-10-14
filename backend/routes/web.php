<?php

use App\Modules\Website\Http\Controllers\AndroidAppController;
use App\Modules\Website\Http\Controllers\SeoController;
use App\Modules\Website\Http\Controllers\SiteAppController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Per-business SEO files (the host decides which business).
Route::get('robots.txt', [SeoController::class, 'robots']);
Route::get('sitemap.xml', [SeoController::class, 'sitemap']);

// Each business website installs as its own app (manifest + icons from its logo and colours).
Route::get('site.webmanifest', [SiteAppController::class, 'manifest']);
Route::get('site-icon-{size}.png', [SiteAppController::class, 'icon'])->whereNumber('size');

// Android app (Trusted Web Activity) verification for this host.
Route::get('.well-known/assetlinks.json', [AndroidAppController::class, 'assetLinks']);
