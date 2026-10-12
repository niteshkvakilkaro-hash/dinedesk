<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Tiffin / meal subscriptions: plans, subscribers, and each day's deliveries. */
    public function up(): void
    {
        Schema::create('meal_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('description', 300)->nullable();
            $table->string('diet', 10)->nullable(); // veg / non_veg
            $table->string('slot', 10)->default('lunch'); // lunch / dinner / both
            $table->unsignedSmallInteger('meals'); // each lunch or dinner delivered counts as one
            $table->unsignedSmallInteger('days_valid');
            $table->decimal('price', 10, 2);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('meal_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->foreignId('meal_plan_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('phone', 15);
            $table->string('address', 300);
            $table->string('slot', 10);
            // requested (from the website, not paid yet) → active ⇄ paused → completed / cancelled
            $table->string('status', 12);
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->date('paused_on')->nullable();
            $table->unsignedSmallInteger('meals_total')->default(0);
            $table->unsignedSmallInteger('meals_used')->default(0);
            $table->decimal('amount_paid', 10, 2)->default(0);
            $table->string('notes', 300)->nullable();
            $table->string('source', 10)->default('staff');
            $table->timestamps();
            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('meal_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('meal_subscription_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('slot', 10);
            $table->string('status', 10); // delivered / skipped
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at')->nullable();
            $table->unique(['meal_subscription_id', 'date', 'slot']);
            $table->index(['tenant_id', 'date']);
        });

        Schema::create('meal_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('meal_subscription_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('mode', 10);
            $table->string('kind', 10); // start / renewal
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('paid_at');
            $table->index(['tenant_id', 'paid_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meal_payments');
        Schema::dropIfExists('meal_deliveries');
        Schema::dropIfExists('meal_subscriptions');
        Schema::dropIfExists('meal_plans');
    }
};
