<?php

namespace App\Modules\Identity\Actions;

use App\Models\User;
use App\Modules\Identity\Support\SessionPayload;
use App\Support\ApiException;

class IssueToken
{
    /** @return array{token: string, session: array} */
    public function __invoke(User $user, string $device = 'web'): array
    {
        if (! $user->isActive()) {
            throw new ApiException('This account has been disabled. Contact your business owner.', 403, 'account_disabled');
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken($device)->plainTextToken;

        return ['token' => $token, 'session' => SessionPayload::for($user)];
    }
}
