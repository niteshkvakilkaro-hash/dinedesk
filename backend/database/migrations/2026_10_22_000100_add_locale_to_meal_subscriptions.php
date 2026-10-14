<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The subscriber's language (from the website's X-Locale), for their tiffin messages. */
    public function up(): void
    {
        Schema::table('meal_subscriptions', function (Blueprint $table) {
            $table->string('locale', 2)->default('en')->after('source');
        });
    }

    public function down(): void
    {
        Schema::table('meal_subscriptions', function (Blueprint $table) {
            $table->dropColumn('locale');
        });
    }
};
