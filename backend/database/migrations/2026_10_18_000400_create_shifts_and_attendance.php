<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The weekly rota (who works when) and the clock-in / clock-out record. */
    public function up(): void
    {
        Schema::create('staff_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            // Local times "HH:MM"; an end before the start runs past midnight.
            $table->string('starts', 5);
            $table->string('ends', 5);
            $table->string('note', 100)->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'date']);
        });

        Schema::create('attendance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The local working day the shift started on.
            $table->date('date');
            $table->dateTime('clock_in');
            $table->dateTime('clock_out')->nullable();
            // self = the person clocked themselves; manager = added or corrected by a manager.
            $table->string('source', 10)->default('self');
            $table->string('note', 150)->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'date']);
            $table->index(['user_id', 'clock_out']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
        Schema::dropIfExists('staff_shifts');
    }
};
