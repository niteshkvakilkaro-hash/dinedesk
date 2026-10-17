<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Phones with the DineDesk Android app where someone is signed in (Firebase Cloud Messaging).
     * User-level: owners, staff, riders and super admins. access_token_id = the sign-in that
     * registered it, so signing out removes the device.
     */
    public function up(): void
    {
        Schema::create('push_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->string('token', 512)->unique();
            $table->string('platform', 16)->default('android');
            $table->string('app_flavor', 16)->nullable();
            $table->string('app_version', 32)->nullable();
            $table->string('locale', 8)->nullable();
            $table->unsignedBigInteger('access_token_id')->nullable()->index();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_devices');
    }
};
