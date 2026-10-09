<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(config('dinedesk.super_admin.email'));
        if (User::where('email', $email)->exists()) {
            return;
        }

        $password = config('dinedesk.super_admin.password');
        if (! $password) {
            $password = Str::password(16, symbols: false);
            $this->command?->warn("SUPER_ADMIN_PASSWORD is empty. Generated password: {$password}");
        }

        User::create([
            'name' => 'Platform Admin',
            'email' => $email,
            'password' => $password,
            'is_platform_admin' => true,
            'email_verified_at' => now(),
        ]);

        $this->command?->info("Super admin created: {$email}");
    }
}
