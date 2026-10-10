<?php

use App\Modules\Subscriptions\Http\Controllers\PlatformWebhookController;
use App\Modules\Subscriptions\Http\Controllers\SubscriptionController;
use Illuminate\Support\Facades\Route;

// Razorpay → platform (business subscriptions)
Route::post('webhooks/razorpay-platform', PlatformWebhookController::class)->middleware('throttle:webhooks');

// Dashboard → Billing. Named saas.* so it keeps working while a business is read-only.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:billing.manage'])->prefix('tenant/subscription')->name('saas.')->group(function () {
    Route::get('/', [SubscriptionController::class, 'show'])->name('show');
    Route::post('checkout', [SubscriptionController::class, 'checkout'])->name('checkout');
    Route::post('verify', [SubscriptionController::class, 'verify'])->name('verify');
    Route::post('change', [SubscriptionController::class, 'change'])->name('change');
    Route::post('cancel', [SubscriptionController::class, 'cancel'])->name('cancel');
    Route::get('invoices/{id}', [SubscriptionController::class, 'invoice'])->name('invoice');
});
