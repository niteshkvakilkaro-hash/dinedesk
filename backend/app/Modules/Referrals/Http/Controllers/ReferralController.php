<?php

namespace App\Modules\Referrals\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Referrals\Services\ReferralCodes;
use App\Modules\Referrals\Services\ReferralRewards;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;

class ReferralController extends Controller
{
    /** GET /tenant/referrals (owner): link code, counts, referred businesses, rewards. */
    public function show(TenantContext $context, ReferralRewards $rewards): JsonResponse
    {
        return $this->ok($rewards->forOwner($context->require()));
    }

    /**
     * GET /referrals/{code} (public, rate-limited): the referring business's name for the
     * "Invited by" note on sign-up. Nothing else; unknown, demo and suspended codes are 404.
     */
    public function lookup(string $code, ReferralCodes $codes): JsonResponse
    {
        $referrer = $codes->referrer($code);
        if (! $referrer) {
            throw new ApiException('This invite link is not valid.', 404, 'not_found');
        }

        return $this->ok(['name' => $referrer->name]);
    }
}
