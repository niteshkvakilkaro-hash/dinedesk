<?php

use App\Modules\Referrals\Http\Controllers\PlatformReferralController;
use App\Modules\Referrals\Http\Controllers\ReferralController;
use Illuminate\Support\Facades\Route;

// Sign-up: "Invited by <business>" (name only).
Route::get('referrals/{code}', [ReferralController::class, 'lookup'])->middleware('throttle:referral-lookup');

// Dashboard → Billing → Refer a business (owner). Named saas.* so it works while read-only.
Route::middleware(['auth:sanctum', 'tenant.user', 'throttle:api', 'tenant.can:billing.manage'])
    ->get('tenant/referrals', [ReferralController::class, 'show'])->name('saas.referrals');

Route::middleware(['auth:sanctum', 'platform.admin', 'throttle:api'])
    ->post('platform/tenants/{publicId}/referral-rewards/{rewardId}/applied', [PlatformReferralController::class, 'markApplied'])->whereNumber('rewardId');
