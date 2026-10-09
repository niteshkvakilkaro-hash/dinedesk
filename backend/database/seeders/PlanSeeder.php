<?php

namespace Database\Seeders;

use App\Modules\Plans\Models\Plan;
use App\Modules\Plans\Support\Features;
use Illuminate\Database\Seeder;

/**
 * Starter / Growth / Pro with the features and limits from the product spec.
 * Prices are left empty on purpose: the platform owner sets them in
 * Super Admin › Plans. Re-running keeps any prices already set.
 */
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            'starter' => ['Starter', 'Website, online ordering and table reservations.'],
            'growth' => ['Growth', 'Adds QR table ordering, kitchen display, POS, inventory and loyalty.'],
            'pro' => ['Pro', 'Adds the hotel module and multiple branches.'],
        ];

        foreach (array_keys($plans) as $i => $code) {
            $plan = Plan::firstOrNew(['code' => $code]);
            $plan->fill([
                'name' => $plans[$code][0],
                'description' => $plans[$code][1],
                'features' => Features::forPlan($code),
                'limits' => Features::limitsForPlan($code),
                'sort_order' => $i + 1,
                'is_active' => true,
            ]);
            $plan->save();
        }
    }
}
