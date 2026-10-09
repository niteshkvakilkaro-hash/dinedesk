<?php

namespace App\Modules\Plans\Support;

/**
 * The catalogue of gateable features and limits, and the plan each one
 * first appears in. The frontend reads the resolved list from /auth/me, so a
 * key added here is all that's needed to gate a new module.
 */
final class Features
{
    // Feature key => lowest plan that includes it.
    public const CATALOGUE = [
        'website' => 'starter',
        'themes' => 'starter',
        'online_ordering' => 'starter',
        'reservations' => 'starter',
        'qr_ordering' => 'growth',
        'kds' => 'growth',
        'pos' => 'growth',
        'tables' => 'growth',
        'inventory' => 'growth',
        'loyalty' => 'growth',
        'coupons' => 'growth',
        'custom_domain' => 'growth',
        'hotel' => 'pro',
        'multi_branch' => 'pro',
    ];

    // Limit key => [starter, growth, pro]; null = unlimited.
    public const LIMITS = [
        'menu_items' => [50, null, null],
        // Staff accounts excluding the owner.
        'staff_accounts' => [2, 10, null],
        'branches' => [1, 1, null],
    ];

    public const PLAN_ORDER = ['starter', 'growth', 'pro'];

    public static function keys(): array
    {
        return array_keys(self::CATALOGUE);
    }

    /** Features included in a plan by default. */
    public static function forPlan(string $plan): array
    {
        $rank = array_search($plan, self::PLAN_ORDER, true);

        return array_keys(array_filter(
            self::CATALOGUE,
            fn (string $minPlan) => array_search($minPlan, self::PLAN_ORDER, true) <= $rank,
        ));
    }

    public static function limitsForPlan(string $plan): array
    {
        $rank = array_search($plan, self::PLAN_ORDER, true);

        return array_map(fn (array $values) => $values[$rank], self::LIMITS);
    }
}
