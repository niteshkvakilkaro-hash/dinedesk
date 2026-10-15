<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Delivery riders: who takes a delivery order, when a rider is on duty, and where their
     * phone was while on duty (kept a few days, see dinedesk.riders.retention_days).
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('rider_id')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->dateTime('rider_assigned_at')->nullable()->after('rider_id');
            $table->index(['tenant_id', 'rider_id', 'status']);
        });

        Schema::create('rider_duties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->dateTime('started_at');
            $table->dateTime('ended_at')->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'ended_at']);
            $table->index(['user_id', 'ended_at']);
        });

        Schema::create('rider_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->unsignedInteger('accuracy_m')->nullable();
            $table->decimal('speed', 6, 2)->nullable();   // metres per second
            $table->unsignedSmallInteger('heading')->nullable(); // degrees from north
            $table->unsignedTinyInteger('battery')->nullable();  // percent
            $table->dateTime('recorded_at');
            $table->timestamp('created_at')->nullable();
            // A batch sent twice (the phone retried) is stored once.
            $table->unique(['user_id', 'recorded_at']);
            $table->index(['tenant_id', 'user_id', 'recorded_at']);
            $table->index('recorded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_locations');
        Schema::dropIfExists('rider_duties');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'rider_id', 'status']);
            $table->dropConstrainedForeignId('rider_id');
            $table->dropColumn('rider_assigned_at');
        });
    }
};
