<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** One row per automatic message sent (birthday, anniversary, win-back), so none goes twice. */
    public function up(): void
    {
        Schema::create('automation_sends', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 16); // birthday | anniversary | winback
            $table->string('channel', 10);
            $table->date('sent_on');
            $table->timestamps();
            $table->unique(['tenant_id', 'customer_id', 'kind', 'sent_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('automation_sends');
    }
};
