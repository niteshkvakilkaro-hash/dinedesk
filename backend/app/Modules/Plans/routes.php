<?php

use App\Modules\Plans\Http\Controllers\PlanController;
use Illuminate\Support\Facades\Route;

Route::get('plans', [PlanController::class, 'index'])->middleware('throttle:api');
