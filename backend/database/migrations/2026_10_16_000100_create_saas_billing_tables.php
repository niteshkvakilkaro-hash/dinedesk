<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 8 — SaaS billing and scale: Razorpay subscriptions with grace period and read-only
 * mode, platform invoices (platform GSTIN), platform settings, linked branch outlets,
 * data exports, and audited support sessions.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Razorpay plans are created per plan, cycle and amount (a new price makes a new Razorpay plan).
        Schema::table('plans', function (Blueprint $table) {
            $table->json('razorpay_plans')->nullable()->after('limits'); // {"monthly": {"id": "plan_x", "amount": 118000}, ...}
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->enum('status', ['trialing', 'pending', 'active', 'past_due', 'halted', 'cancelled', 'expired'])->default('trialing')->change();
            $table->timestamp('current_period_starts_at')->nullable()->after('trial_ends_at');
            $table->timestamp('grace_ends_at')->nullable()->after('current_period_ends_at');
            $table->boolean('cancel_at_period_end')->default(false)->after('grace_ends_at');
            $table->foreignId('scheduled_plan_id')->nullable()->after('plan_id')->constrained('plans')->nullOnDelete(); // downgrade at period end
            $table->string('checkout_url', 255)->nullable()->after('provider_subscription_id');
            $table->timestamp('last_charged_at')->nullable();
            $table->timestamp('ended_at')->nullable();
        });

        // Invoices the platform issues to businesses for their subscription (platform GSTIN).
        Schema::create('platform_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_id')->nullable()->constrained()->nullOnDelete();
            $table->ulid('public_id')->unique();
            $table->string('number', 30)->unique(); // DD/2026-27/0001
            $table->string('financial_year', 7);
            $table->unsignedInteger('sequence');
            $table->string('plan_code', 30);
            $table->string('billing_cycle', 10);
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->json('seller');
            $table->json('buyer');
            $table->string('sac', 10);
            $table->decimal('taxable_value', 12, 2);
            $table->decimal('gst_rate', 5, 2);
            $table->decimal('cgst', 12, 2)->default(0);
            $table->decimal('sgst', 12, 2)->default(0);
            $table->decimal('igst', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->string('provider_payment_id', 64)->nullable()->unique();
            $table->dateTime('issued_at');
            $table->timestamps();

            $table->unique(['financial_year', 'sequence']);
            $table->index(['tenant_id', 'issued_at']);
        });

        // Platform-wide settings (not per business): seller details, GST, grace days, domain target.
        Schema::create('platform_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        // Branches: an outlet is its own business linked to the main one (shared subscription and owner).
        Schema::table('tenants', function (Blueprint $table) {
            $table->foreignId('parent_tenant_id')->nullable()->after('plan_id')->constrained('tenants')->nullOnDelete();
        });

        Schema::create('data_exports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->ulid('public_id')->unique();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 12)->default('queued'); // queued | ready | failed
            $table->string('path', 255)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->string('error', 255)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        // "Login as business" by a super admin: time-limited, with a reason, every action audited.
        Schema::create('support_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('token_id')->nullable()->index();
            $table->string('reason', 255);
            $table->boolean('read_only')->default(true);
            $table->string('ip', 45)->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_sessions');
        Schema::dropIfExists('data_exports');
        Schema::table('tenants', fn (Blueprint $t) => $t->dropConstrainedForeignId('parent_tenant_id'));
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('platform_invoices');
        Schema::table('subscriptions', function (Blueprint $t) {
            $t->dropConstrainedForeignId('scheduled_plan_id');
            $t->dropColumn(['current_period_starts_at', 'grace_ends_at', 'cancel_at_period_end', 'checkout_url', 'last_charged_at', 'ended_at']);
        });
        Schema::table('plans', fn (Blueprint $t) => $t->dropColumn('razorpay_plans'));
    }
};
