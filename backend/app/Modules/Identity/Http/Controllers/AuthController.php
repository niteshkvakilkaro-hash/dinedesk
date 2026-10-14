<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Identity\Actions\IssueToken;
use App\Modules\Identity\Services\OtpService;
use App\Modules\Identity\Support\SessionPayload;
use App\Support\ApiException;
use App\Support\Locale;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function __construct(private readonly IssueToken $issueToken) {}

    /** Onboarding step 1 (email): create an account. */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['required', 'email:rfc', 'max:150', 'unique:users,email'],
            'password' => ['required', Password::min(8)->letters()->numbers()],
        ], [
            'email.unique' => 'An account with this email already exists. Sign in instead.',
        ]);

        $user = User::create([
            'name' => strip_tags($data['name']),
            'email' => strtolower($data['email']),
            'password' => $data['password'],
            // The language they signed up in becomes the account's (the dashboard opens in it on any device).
            'locale' => Locale::guest($request->header('X-Locale')),
        ]);

        return $this->created(($this->issueToken)($user), 'Account created.');
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw new ApiException('Email or password is incorrect.', 422, 'invalid_credentials', ['field' => 'email']);
        }

        return $this->ok(($this->issueToken)($user), 'Signed in.');
    }

    /** Onboarding step 1 (mobile): send a code. */
    public function sendOtp(Request $request, OtpService $otp): JsonResponse
    {
        $request->merge(['phone' => Phone::normalize($request->input('phone'))]);
        $data = $request->validate(['phone' => ['required', Phone::RULE]], ['phone.regex' => Phone::MESSAGE]);

        $result = $otp->send($data['phone'], $request->ip());
        $result['is_new'] = ! User::where('phone', $data['phone'])->exists();

        return $this->ok($result, 'We sent a 6-digit code to your mobile.');
    }

    /**
     * Verify the code and sign in. New numbers also need a name to create
     * the account; the code is only consumed once sign-in succeeds.
     */
    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        $request->merge(['phone' => Phone::normalize($request->input('phone'))]);
        $data = $request->validate([
            'phone' => ['required', Phone::RULE],
            'code' => ['required', 'digits:'.config('dinedesk.otp.length')],
            'name' => ['nullable', 'string', 'min:2', 'max:100'],
        ], ['phone.regex' => Phone::MESSAGE]);

        $otpId = $otp->check($data['phone'], $data['code']);

        $user = User::where('phone', $data['phone'])->first();
        if (! $user && empty($data['name'])) {
            throw new ApiException('Tell us your name to create your account.', 422, 'name_required', ['field' => 'name']);
        }

        $locale = Locale::guest($request->header('X-Locale'));
        $user = DB::transaction(function () use ($user, $data, $otp, $otpId, $locale) {
            $user ??= User::create(['name' => strip_tags($data['name']), 'phone' => $data['phone'], 'locale' => $locale]);
            $user->forceFill(['phone_verified_at' => $user->phone_verified_at ?? now()])->save();
            $otp->consume($otpId);

            return $user;
        });

        return $this->ok(($this->issueToken)($user, 'web-otp'), 'Signed in.');
    }

    public function me(Request $request): JsonResponse
    {
        return $this->ok(SessionPayload::for($request->user()));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return $this->ok(null, 'Signed out.');
    }
}
