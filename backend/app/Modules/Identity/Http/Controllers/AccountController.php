<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Services\OtpService;
use App\Modules\Identity\Support\SessionPayload;
use App\Support\ApiException;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * My account: the signed-in person (owner, staff or super admin) edits their own name,
 * email, mobile number (verified with an SMS code), password and dashboard language.
 * User-level, so it works in any business status (read-only included); a super admin in a
 * support session can't change their own account from inside a business.
 */
class AccountController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $user = $this->user($request);
        if ($request->filled('email')) {
            $request->merge(['email' => strtolower(trim((string) $request->input('email')))]);
        }
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:100'],
            'email' => ['sometimes', 'nullable', 'email:rfc', 'max:150', Rule::unique('users', 'email')->ignore($user->id)],
            'locale' => ['sometimes', Rule::in(config('dinedesk.languages'))],
            'current_password' => ['nullable', 'string'],
        ], ['email.unique' => 'This email already has a DineDesk account.']);

        $changes = [];
        if (isset($data['name'])) {
            $changes['name'] = strip_tags($data['name']);
        }
        if (isset($data['locale'])) {
            $changes['locale'] = $data['locale'];
        }
        if (array_key_exists('email', $data) && $data['email'] !== $user->email) {
            // There is no email verification: the password proves it's really them. Email is
            // also how they sign in, so it can't be removed while it's their only way in.
            $this->confirmPassword($user, $data['current_password'] ?? null);
            if ($data['email'] === null && ! $user->phone) {
                throw new ApiException('Add a mobile number before removing your email, so you can still sign in.', 422, 'email_required', ['field' => 'email']);
            }
            $changes['email'] = $data['email'];
            $changes['email_verified_at'] = null;
        }

        if ($changes) {
            $user->update($changes);
            AuditLog::record('account.updated', $user, ['fields' => array_keys($changes)], $user->tenant_id);
        }

        return $this->ok(SessionPayload::for($user->fresh()), 'Your account is saved.');
    }

    /** Change the password (current one required), or set one after signing up by mobile. */
    public function password(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'current_password' => ['nullable', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);
        $this->confirmPassword($user, $data['current_password'] ?? null);

        DB::transaction(function () use ($user, $data, $request) {
            $user->update(['password' => $data['password']]);
            // Signed out everywhere else; this device stays signed in.
            $current = $request->user()->currentAccessToken();
            $user->tokens()->when($current instanceof PersonalAccessToken ? $current->id : null, fn ($q, $id) => $q->whereKeyNot($id))->delete();
            AuditLog::record('account.password_changed', $user, [], $user->tenant_id);
        });

        return $this->ok(SessionPayload::for($user->fresh()), 'Your password is changed.');
    }

    /** Step 1 of adding or changing the mobile number: a code by SMS. */
    public function phoneCode(Request $request, OtpService $otp): JsonResponse
    {
        $user = $this->user($request);
        $phone = $this->newPhone($request, $user);

        return $this->ok($otp->send($phone, $request->ip()), 'We sent a 6-digit code to your mobile.');
    }

    /** Step 2: the code from that SMS saves the number as verified. */
    public function phoneVerify(Request $request, OtpService $otp): JsonResponse
    {
        $user = $this->user($request);
        $request->validate(['code' => ['required', 'digits:'.config('dinedesk.otp.length')]]);
        $phone = $this->newPhone($request, $user);
        $otpId = $otp->check($phone, (string) $request->input('code'));

        DB::transaction(function () use ($user, $phone, $otp, $otpId) {
            // Checked again inside the transaction: the number may have been taken meanwhile.
            if (User::where('phone', $phone)->whereKeyNot($user->id)->lockForUpdate()->exists()) {
                throw $this->phoneTaken();
            }
            $user->update(['phone' => $phone, 'phone_verified_at' => now()]);
            $otp->consume($otpId);
            AuditLog::record('account.phone_changed', $user, [], $user->tenant_id);
        });

        return $this->ok(SessionPayload::for($user->fresh()), 'Your mobile number is verified.');
    }

    private function user(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        if ($user->supportSession()) {
            throw new ApiException('Your own account can’t be changed during a support session.', 403, 'support_session');
        }

        return $user;
    }

    private function newPhone(Request $request, User $user): string
    {
        $request->merge(['phone' => Phone::normalize($request->input('phone'))]);
        $phone = (string) $request->validate(['phone' => ['required', Phone::RULE]], ['phone.regex' => Phone::MESSAGE])['phone'];
        if ($phone === $user->phone && $user->phone_verified_at) {
            throw new ApiException('This is already your verified mobile number.', 422, 'phone_unchanged', ['field' => 'phone']);
        }
        if (User::where('phone', $phone)->whereKeyNot($user->id)->exists()) {
            throw $this->phoneTaken();
        }

        return $phone;
    }

    private function phoneTaken(): ApiException
    {
        return new ApiException('This mobile number already has a DineDesk account.', 422, 'phone_taken', ['field' => 'phone']);
    }

    /** Accounts made by mobile have no password yet: nothing to confirm. */
    private function confirmPassword(User $user, ?string $current): void
    {
        if ($user->password && (! $current || ! Hash::check($current, $user->password))) {
            throw new ApiException('Your current password is incorrect.', 422, 'wrong_password', ['field' => 'current_password']);
        }
    }
}
