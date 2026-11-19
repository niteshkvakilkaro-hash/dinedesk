<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Try live demo" from the website: a visitor's own sample business, removed from view after a few
 * days (demo_expires_at). demo_lead keeps who asked for it (name, mobile) for the super admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('demo_expires_at')->nullable()->after('is_demo')->index();
            $table->json('demo_lead')->nullable()->after('demo_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropColumn(['demo_expires_at', 'demo_lead']);
        });
    }
};
