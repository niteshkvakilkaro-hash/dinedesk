<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique(); // starter | growth | pro
            $table->string('name', 60);
            $table->string('description', 255)->nullable();
            // Prices are set by the platform owner; null means "not priced yet".
            $table->decimal('price_monthly', 12, 2)->nullable();
            $table->decimal('price_yearly', 12, 2)->nullable();
            $table->json('features');   // ["online_ordering", "qr_ordering", ...]
            $table->json('limits');     // {"menu_items": 50, "staff_accounts": 2, ...}; null = unlimited
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->string('name', 120);
            $table->string('slug', 63)->unique();
            $table->enum('business_type', ['restaurant', 'cafe', 'cloud_kitchen', 'hotel']);
            $table->string('city', 80)->nullable();
            $table->string('gstin', 15)->nullable();
            $table->string('timezone', 64)->default('Asia/Kolkata');
            $table->enum('status', ['onboarding', 'live', 'suspended', 'read_only'])->default('onboarding');
            $table->unsignedTinyInteger('onboarding_step')->default(3);
            // Seeded sample businesses are labelled "Demo" everywhere until removed.
            $table->boolean('is_demo')->default(false);
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->timestamp('last_active_at')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index('plan_id');
        });

        Schema::create('tenant_domains', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('domain', 253)->unique();
            $table->enum('type', ['subdomain', 'custom']);
            $table->boolean('is_primary')->default(false);
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'is_primary']);
        });

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            // Null for platform-level users (super admins) and for accounts that
            // have signed up but not created their business yet.
            $table->foreignId('tenant_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('name', 100);
            $table->string('email')->nullable()->unique();
            $table->string('phone', 15)->nullable()->unique();
            $table->string('password')->nullable();
            $table->boolean('is_platform_admin')->default(false);
            $table->enum('status', ['active', 'disabled'])->default('active');
            $table->string('locale', 5)->default('en');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('phone_verified_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
        Schema::dropIfExists('tenant_domains');
        Schema::dropIfExists('tenants');
        Schema::dropIfExists('plans');
    }
};
