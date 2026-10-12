<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Diet labels the owner sets per dish (Jain, no onion/garlic, vegan, gluten-free). */
    public function up(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->json('diet_tags')->nullable()->after('allergens');
        });
    }

    public function down(): void
    {
        Schema::table('menu_items', function (Blueprint $table) {
            $table->dropColumn('diet_tags');
        });
    }
};
