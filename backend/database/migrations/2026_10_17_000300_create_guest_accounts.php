<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Guests sign in on a business website with their phone and an SMS code to see their
     * orders on any device and keep their addresses. Kept apart from the CRM's customers,
     * which are built only from real orders and bookings.
     */
    public function up(): void
    {
        Schema::create('guest_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('phone', 20);
            $table->string('name', 120)->nullable();
            $table->json('addresses')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'phone']);
        });

        Schema::create('guest_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('guest_account_id')->constrained()->cascadeOnDelete();
            $table->char('token_hash', 64)->unique();
            $table->dateTime('expires_at'); // not TIMESTAMP: MariaDB would add ON UPDATE CURRENT_TIMESTAMP
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_sessions');
        Schema::dropIfExists('guest_accounts');
    }
};
