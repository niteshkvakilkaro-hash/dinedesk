<?php

namespace App\Modules\Referrals\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Referrals\Models\ReferralReward;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Super admin: a pending referral credit was given by hand (refund, Razorpay offer ...). */
class PlatformReferralController extends Controller
{
    public function markApplied(Request $request, string $publicId, int $rewardId, ReferralRewards $rewards): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'min:5', 'max:255']]);
        $tenant = Tenant::withTrashed()->where('public_id', $publicId)->firstOrFail();
        $reward = ReferralReward::where('tenant_id', $tenant->billingRoot()->id)->whereKey($rewardId)->firstOrFail();
        if ($reward->status !== 'pending') {
            throw new ApiException('This reward has already been applied.', 422, 'already_applied');
        }
        $rewards->markApplied($reward, $request->user(), $data['note']);

        return $this->ok($rewards->forPlatform($tenant), 'Marked as applied.');
    }
}
