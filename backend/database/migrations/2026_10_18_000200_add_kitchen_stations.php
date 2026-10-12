<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kitchen stations (Tandoor, Bar, Chinese ...): a menu section can go to its own station,
     * and an order then makes one ticket per station.
     */
    public function up(): void
    {
        Schema::table('menu_categories', function (Blueprint $table) {
            $table->string('station', 30)->nullable()->after('tax_rate');
        });
        Schema::table('kots', function (Blueprint $table) {
            $table->string('station', 30)->nullable()->after('order_type');
        });
    }

    public function down(): void
    {
        Schema::table('kots', fn (Blueprint $table) => $table->dropColumn('station'));
        Schema::table('menu_categories', fn (Blueprint $table) => $table->dropColumn('station'));
    }
};
