<?php

namespace App\Modules\Identity\Support;

use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Business roles and what each may do. Roles are global definitions; a user
 * gets a role *within a tenant* (spatie "teams" with tenant_id as the team).
 * The platform super admin is a separate flag (users.is_platform_admin).
 */
final class Roles
{
    public const OWNER = 'owner';
    public const MANAGER = 'manager';
    public const CASHIER = 'cashier';
    public const WAITER = 'waiter';
    public const KITCHEN = 'kitchen';
    public const FRONT_DESK = 'front_desk';

    public const ALL = [self::OWNER, self::MANAGER, self::CASHIER, self::WAITER, self::KITCHEN, self::FRONT_DESK];

    /** Roles an owner can give to staff (owner is not assignable). */
    public const ASSIGNABLE = [self::MANAGER, self::CASHIER, self::WAITER, self::KITCHEN, self::FRONT_DESK];

    public const PERMISSIONS = [
        'business.manage',     // business details, hours, domains
        'billing.manage',      // plan and subscription
        'staff.manage',        // add/remove staff, change roles
        'staff.schedule',      // shifts and attendance
        'theme.manage',        // website theme and content
        'menu.manage',
        'orders.view',
        'orders.manage',       // change status, refunds (with audit)
        'orders.create',       // waiter/POS order entry
        'reservations.manage',
        'tables.manage',     // live table board, waiter/bill requests, settle bills
        'tables.setup',      // add/edit tables and print their QR codes
        'kot.update',          // kitchen display
        'pos.use',
        'reports.view',
        'rooms.manage',        // hotel front desk
    ];

    public const MATRIX = [
        self::OWNER => '*',
        self::MANAGER => ['staff.schedule', 'theme.manage', 'menu.manage', 'orders.view', 'orders.manage', 'orders.create', 'reservations.manage', 'tables.manage', 'tables.setup', 'reports.view', 'rooms.manage'],
        self::CASHIER => ['pos.use', 'orders.view', 'orders.manage', 'orders.create', 'tables.manage'],
        self::WAITER => ['orders.view', 'orders.create', 'tables.manage'],
        self::KITCHEN => ['kot.update', 'orders.view'],
        self::FRONT_DESK => ['rooms.manage', 'reservations.manage', 'orders.view', 'orders.create'],
    ];

    /** Create/refresh every permission and role (idempotent). */
    public static function sync(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $previousTeam = getPermissionsTeamId();
        setPermissionsTeamId(null); // global role definitions

        foreach (self::PERMISSIONS as $name) {
            Permission::findOrCreate($name, 'web');
        }
        foreach (self::MATRIX as $roleName => $permissions) {
            $role = Role::where('name', $roleName)->whereNull(config('permission.column_names.team_foreign_key'))->where('guard_name', 'web')->first()
                ?? Role::create(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($permissions === '*' ? self::PERMISSIONS : $permissions);
        }

        setPermissionsTeamId($previousTeam);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
