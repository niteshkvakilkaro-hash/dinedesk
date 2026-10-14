<?php

namespace App\Modules\Referrals\Services;

use App\Modules\Tenancy\Models\Tenant;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Referral codes: 8 characters from an alphabet without look-alikes (no I, O, 0, 1), about
 * 10^12 combinations. Only main businesses that are not demos have one; branches share
 * their main business's code.
 */
class ReferralCodes
{
    public const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public const LENGTH = 8;

    public static function unusedCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < self::LENGTH; $i++) {
                $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }
        } while (DB::table('tenants')->where('referral_code', $code)->exists());

        return $code;
    }

    /** "ab cd-2345 " → "ABCD2345"; anything that can't be a code → null. */
    public static function normalize(?string $code): ?string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $code));

        return strlen($clean) === self::LENGTH && strspn($clean, self::ALPHABET) === self::LENGTH ? $clean : null;
    }

    /** The business's code (its main business's for a branch), created on first use. Demos have none. */
    public function codeFor(Tenant $tenant): ?string
    {
        $root = $tenant->billingRoot();
        if ($root->is_demo) {
            return null;
        }
        for ($try = 0; ! $root->referral_code && $try < 3; $try++) {
            try {
                $root->update(['referral_code' => self::unusedCode()]);
            } catch (UniqueConstraintViolationException) {
                $root->referral_code = null;
            }
        }

        return $root->referral_code;
    }

    /** The business a code belongs to, if it can refer: a main business, not a demo, not suspended. */
    public function referrer(?string $code): ?Tenant
    {
        $code = self::normalize($code);

        return $code ? Tenant::where('referral_code', $code)->whereNull('parent_tenant_id')->where('is_demo', false)->where('status', '!=', 'suspended')->first() : null;
    }
}
