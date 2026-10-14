<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use Tests\TestCase;

class PermissionsTest extends TestCase
{
    public function test_roles_carry_the_right_permissions(): void
    {
        $t = $this->business();
        $this->assertSame('owner', $this->ownerOf($t)->tenantRole());
        $this->assertContains('billing.manage', $this->ownerOf($t)->tenantPermissions());

        $manager = $this->staff($t, 'manager');
        $this->assertContains('menu.manage', $manager->tenantPermissions());
        $this->assertNotContains('billing.manage', $manager->tenantPermissions());
        $this->assertNotContains('staff.manage', $manager->tenantPermissions());

        $kitchen = $this->staff($t, 'kitchen');
        $this->assertSame(['kot.update', 'orders.view'], collect($kitchen->tenantPermissions())->sort()->values()->all());
    }

    public function test_only_the_owner_manages_staff_and_business_details(): void
    {
        $t = $this->business();
        foreach (['manager', 'cashier', 'waiter', 'kitchen', 'front_desk'] as $role) {
            $this->actingAsUser($this->staff($t, $role));
            $this->getJson('/api/v1/tenant/staff')->assertForbidden();
            $this->putJson('/api/v1/tenant/business', ['city' => 'X'])->assertForbidden();
        }
        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/tenant/staff')->assertOk();
    }

    public function test_owner_adds_changes_and_removes_staff(): void
    {
        $t = $this->business();
        $this->actingAsUser($this->ownerOf($t));

        $id = $this->postJson('/api/v1/tenant/staff', ['name' => 'Ravi', 'phone' => '98111 22233', 'role' => 'waiter'], ['X-Locale' => 'hi'])
            ->assertCreated()->assertJsonPath('data.role', 'waiter')->assertJsonPath('data.phone', '+919811122233')->json('data.id');
        // New staff start in the owner's language.
        $this->assertSame('hi', User::find($id)->locale);

        $this->postJson('/api/v1/tenant/staff', ['name' => 'Bad', 'phone' => '9811122244', 'role' => 'owner'])
            ->assertStatus(422)->assertJsonValidationErrors('role');
        $this->postJson('/api/v1/tenant/staff', ['name' => 'Needs pw', 'email' => 'np@example.test', 'role' => 'cashier'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->patchJson("/api/v1/tenant/staff/{$id}", ['role' => 'manager'])->assertOk()->assertJsonPath('data.role', 'manager');
        $this->deleteJson("/api/v1/tenant/staff/{$id}")->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $id]);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $t->id, 'action' => 'staff.removed']);
    }

    public function test_owner_cannot_be_changed_and_users_cannot_edit_themselves(): void
    {
        $t = $this->business();
        $owner = $this->ownerOf($t);
        $this->actingAsUser($owner)->patchJson("/api/v1/tenant/staff/{$owner->id}", ['role' => 'waiter'])->assertForbidden();
        $this->actingAsUser($owner)->deleteJson("/api/v1/tenant/staff/{$owner->id}")->assertForbidden();
    }

    public function test_disabling_staff_signs_them_out(): void
    {
        $t = $this->business();
        $waiter = $this->staff($t, 'waiter');
        $waiter->createToken('phone');

        $this->actingAsUser($this->ownerOf($t))->patchJson("/api/v1/tenant/staff/{$waiter->id}", ['status' => 'disabled'])->assertOk();

        $this->assertSame(0, $waiter->tokens()->count());
        $this->postJson('/api/v1/auth/login', ['email' => $waiter->email, 'password' => 'Password123'])->assertForbidden();
    }

    public function test_business_owners_cannot_reach_super_admin_routes(): void
    {
        $t = $this->business();
        $this->getJson('/api/v1/platform/tenants')->assertUnauthorized();
        $this->actingAsUser($this->ownerOf($t))->getJson('/api/v1/platform/tenants')->assertForbidden();
    }
}
