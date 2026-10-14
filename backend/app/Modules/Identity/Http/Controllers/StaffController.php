<?php

namespace App\Modules\Identity\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Identity\Http\Resources\StaffResource;
use App\Modules\Identity\Support\Roles;
use App\Modules\Plans\Services\FeatureService;
use App\Modules\Tenancy\Support\TenantContext;
use App\Support\ApiException;
use App\Support\Locale;
use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Business owners manage their team. Every query is pinned to the tenant in
 * context; a user id from another business simply 404s.
 */
class StaffController extends Controller
{
    public function __construct(
        private readonly TenantContext $context,
        private readonly FeatureService $features,
    ) {}

    private function team(): Builder
    {
        return User::query()->where('tenant_id', $this->context->id());
    }

    private function find(int $id): User
    {
        return $this->team()->with('roles')->findOrFail($id);
    }

    public function index(): JsonResponse
    {
        $tenant = $this->context->require();
        $staff = $this->team()->with('roles')->orderBy('name')->get();

        return $this->ok(StaffResource::collection($staff), null, [
            'staff_count' => $this->staffCount(),
            'staff_limit' => $this->features->limit($tenant, 'staff_accounts'),
            'roles' => Roles::ASSIGNABLE,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenant = $this->context->require();
        $request->merge(['phone' => $request->filled('phone') ? Phone::normalize($request->input('phone')) : null]);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'email' => ['nullable', 'required_without:phone', 'email:rfc', 'max:150', 'unique:users,email'],
            'phone' => ['nullable', 'required_without:email', Phone::RULE, 'unique:users,phone'],
            'role' => ['required', Rule::in(Roles::ASSIGNABLE)],
            // Staff who sign in by email need a password; mobile-only staff use OTP.
            'password' => ['nullable', 'required_with:email', Password::min(8)->letters()->numbers()],
        ], [
            'phone.regex' => Phone::MESSAGE,
            'email.unique' => 'This email already has a DineDesk account.',
            'phone.unique' => 'This mobile number already has a DineDesk account.',
        ]);

        $this->features->assertWithinLimit($tenant, 'staff_accounts', $this->staffCount());

        // New staff start in the language the owner is using; they can change it in My account.
        $locale = Locale::guest($request->header('X-Locale'));
        $user = DB::transaction(function () use ($data, $tenant, $locale) {
            $user = User::create([
                'tenant_id' => $tenant->id,
                'name' => strip_tags($data['name']),
                'email' => isset($data['email']) ? strtolower($data['email']) : null,
                'phone' => $data['phone'] ?? null,
                'password' => $data['password'] ?? null,
                'locale' => $locale,
            ]);
            $user->assignRole($data['role']);
            AuditLog::record('staff.created', $user, ['role' => $data['role']]);

            return $user;
        });

        return $this->created(new StaffResource($user->load('roles')), 'Team member added.');
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = $this->find($id);
        $this->guardEditable($request, $user);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:2', 'max:100'],
            'role' => ['sometimes', Rule::in(Roles::ASSIGNABLE)],
            'status' => ['sometimes', Rule::in(['active', 'disabled'])],
        ]);

        DB::transaction(function () use ($user, $data) {
            $changes = array_intersect_key($data, array_flip(['name', 'status']));
            if (isset($changes['name'])) {
                $changes['name'] = strip_tags($changes['name']);
            }
            $user->update($changes);
            if (isset($data['role'])) {
                $user->syncRoles([$data['role']]);
            }
            if (($data['status'] ?? null) === 'disabled') {
                $user->tokens()->delete(); // sign them out everywhere
            }
            AuditLog::record('staff.updated', $user, $data);
        });

        return $this->ok(new StaffResource($user->fresh()->load('roles')), 'Team member updated.');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $this->find($id);
        $this->guardEditable($request, $user);

        DB::transaction(function () use ($user) {
            AuditLog::record('staff.removed', $user, ['name' => $user->name]);
            $user->tokens()->delete();
            $user->syncRoles([]);
            $user->delete();
        });

        return $this->ok(null, 'Team member removed.');
    }

    /** Staff accounts in use: everyone in the business except the owner. */
    private function staffCount(): int
    {
        return $this->team()->whereDoesntHave('roles', fn ($q) => $q->where('name', Roles::OWNER))->count();
    }

    private function guardEditable(Request $request, User $user): void
    {
        if ($user->id === $request->user()->id) {
            throw new ApiException('You cannot change your own access here.', 403, 'forbidden');
        }
        if ($user->roles->contains('name', Roles::OWNER)) {
            throw new ApiException('The business owner cannot be changed or removed.', 403, 'forbidden');
        }
    }
}
