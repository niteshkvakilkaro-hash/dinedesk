<?php

namespace Database\Seeders;

use App\Modules\Identity\Support\Roles;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        Roles::sync();
    }
}
