<?php

use App\Modules\Website\Http\Controllers\SeoController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Per-business SEO files (the host decides which business).
Route::get('robots.txt', [SeoController::class, 'robots']);
Route::get('sitemap.xml', [SeoController::class, 'sitemap']);
