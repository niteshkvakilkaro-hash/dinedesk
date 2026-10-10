<?php

namespace App\Modules\Platform\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Platform\Models\SupportSession;
use App\Modules\Tenancy\Models\Tenant;
use App\Support\ApiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Login as business" for support. The super admin gets a separate token that opens only
 * that business, for an hour, read-only unless they ask for changes. The reason, start, end
 * and every change are in the business's audit log, under the admin's own name.
 */
class SupportController extends Controller
{
    public function start(Request $request, string $publicId): JsonResponse
    {
        $tenant = Tenant::where('public_id', $publicId)->firstOrFail();
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:10', 'max:255'],
            'read_only' => ['required', 'boolean'],
        ], ['reason.min' => 'Give a clear reason (at least 10 characters).']);
        if ($tenant->status === 'suspended') {
            throw new ApiException('This business is suspended. Restore it first.', 422, 'tenant_suspended');
        }
        $admin = $request->user();
        $expires = now()->addMinutes(SupportSession::MINUTES);
        $token = $admin->createToken('support', ['support'], $expires);
        $session = SupportSession::create([
            'admin_id' => $admin->id,
            'tenant_id' => $tenant->id,
            'token_id' => $token->accessToken->id,
            'reason' => strip_tags($data['reason']),
            'read_only' => $data['read_only'],
            'ip' => $request->ip(),
            'expires_at' => $expires,
        ]);
        AuditLog::record('support.started', $tenant, ['admin' => $admin->email, 'reason' => $session->reason, 'read_only' => $session->read_only, 'session' => $session->id], $tenant->id);

        return $this->created(['token' => $token->plainTextToken, 'expires_at' => $expires->toIso8601String(), 'business' => $tenant->name], 'Support session started.');
    }

    /** End the support session this token belongs to. */
    public function end(Request $request): JsonResponse
    {
        $user = $request->user();
        $session = $user->supportSession();
        if (! $session) {
            throw new ApiException('No support session is open.', 422, 'no_session');
        }
        $session->update(['ended_at' => now()]);
        $user->currentAccessToken()->delete();
        AuditLog::record('support.ended', $session->tenant, ['admin' => $user->email, 'session' => $session->id], $session->tenant_id);

        return $this->ok(null, 'Support session ended.');
    }

    public function index(string $publicId): JsonResponse
    {
        $tenant = Tenant::where('public_id', $publicId)->firstOrFail();

        return $this->ok(SupportSession::with('admin:id,name,email')->where('tenant_id', $tenant->id)->latest('id')->limit(20)->get()->map(fn (SupportSession $s) => [
            'admin' => $s->admin?->name, 'reason' => $s->reason, 'read_only' => $s->read_only,
            'started_at' => $s->created_at->toIso8601String(), 'ended_at' => $s->ended_at?->toIso8601String(), 'expires_at' => $s->expires_at->toIso8601String(),
            'open' => $s->isOpen(),
            'changes' => AuditLog::where('tenant_id', $tenant->id)->where('action', 'support.change')->where('meta->session', $s->id)->count(),
        ])->values());
    }
}
