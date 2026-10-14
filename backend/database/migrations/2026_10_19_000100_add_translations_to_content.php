<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Tables whose owner-written text can be shown in the site's other languages. */
    private const TABLES = ['menu_categories', 'menu_items', 'item_variants', 'addon_groups', 'addons', 'banners', 'room_types'];

    /**
     * Owner's own words in the site languages other than English and Hindi (Hindi keeps its
     * *_hi columns): {"ta": {"name": "...", "description": "..."}, ...}.
     */
    public function up(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->json('translations')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dropColumn('translations');
            });
        }
    }
};
