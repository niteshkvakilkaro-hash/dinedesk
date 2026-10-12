<?php

namespace App\Modules\Identity\Services;

use App\Support\ApiException;
use App\Support\Messaging\Messenger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

/**
 * One-time codes for mobile sign-in. Codes are stored hashed, expire,
 * allow a few attempts, and can't be re-sent too quickly.
 *
 * Delivery drivers: "log" (development: the code is written to the log).
 * An SMS/WhatsApp provider plugs in here later (Phase 3 notifications).
 */
class OtpService
{
    /** @return array{expires_in: int, resend_in: int, dev_code?: string} */
    public function send(string $phone, ?string $ip = null): array
    {
        $config = config('dinedesk.otp');

        $last = DB::table('otp_codes')->where('phone', $phone)->orderByDesc('id')->first();
        if ($last && now()->diffInSeconds($last->created_at, true) < $config['resend_after_seconds']) {
            $wait = $config['resend_after_seconds'] - (int) now()->diffInSeconds($last->created_at, true);
            throw new ApiException("Please wait {$wait} seconds before requesting another code.", 429, 'otp_wait', ['retry_after' => $wait]);
        }

        $code = str_pad((string) random_int(0, 10 ** $config['length'] - 1), $config['length'], '0', STR_PAD_LEFT);

        DB::table('otp_codes')->where('phone', $phone)->whereNull('consumed_at')->update(['consumed_at' => now()]);
        DB::table('otp_codes')->insert([
            'phone' => $phone,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes($config['ttl_minutes']),
            'ip' => $ip,
            'created_at' => now(),
        ]);

        $this->deliver($phone, $code);

        $result = ['expires_in' => $config['ttl_minutes'] * 60, 'resend_in' => $config['resend_after_seconds']];
        if ($config['dev_echo'] && app()->environment('local')) {
            $result['dev_code'] = $code;
        }

        return $result;
    }

    /**
     * Checks a code without consuming it; call consume() once sign-in succeeds.
     *
     * @return int the otp_codes row id
     */
    public function check(string $phone, string $code): int
    {
        $row = DB::table('otp_codes')
            ->where('phone', $phone)
            ->whereNull('consumed_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->first();

        $invalid = fn () => new ApiException('That code is incorrect or has expired.', 422, 'otp_invalid', ['field' => 'code']);

        if (! $row) {
            throw $invalid();
        }
        if ($row->attempts >= config('dinedesk.otp.max_attempts')) {
            DB::table('otp_codes')->where('id', $row->id)->update(['consumed_at' => now()]);
            throw new ApiException('Too many incorrect attempts. Request a new code.', 429, 'otp_locked');
        }

        DB::table('otp_codes')->where('id', $row->id)->increment('attempts');

        if (! Hash::check($code, $row->code_hash)) {
            throw $invalid();
        }

        return $row->id;
    }

    public function consume(int $id): void
    {
        DB::table('otp_codes')->where('id', $id)->update(['consumed_at' => now()]);
    }

    private function deliver(string $phone, string $code): void
    {
        match (config('dinedesk.otp.driver')) {
            'log' => Log::info("[OTP] DineDesk sign-in code for {$phone}: {$code}"),
            // Through the configured Messenger (MSG91's OTP template when MESSAGING_DRIVER=live).
            'sms' => app(Messenger::class)->send('sms', $phone, "{$code} is your DineDesk sign-in code. It expires in ".config('dinedesk.otp.ttl_minutes').' minutes.', $code),
            default => throw new ApiException('SMS delivery is not configured.', 503, 'otp_unavailable'),
        };
    }
}
