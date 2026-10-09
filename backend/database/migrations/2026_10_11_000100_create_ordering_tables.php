<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // GST per category / item (null = inherit: item → category → business default).
        Schema::table('menu_categories', function (Blueprint $table) {
            $table->decimal('tax_rate', 5, 2)->nullable()->after('slug');
        });
        Schema::table('menu_items', function (Blueprint $table) {
            $table->decimal('tax_rate', 5, 2)->nullable()->after('price');
        });

        // Half / Full, Regular / Large ... Each variant carries its own full price.
        Schema::create('item_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('name_hi', 60)->nullable();
            $table->decimal('price', 12, 2);
            $table->boolean('is_default')->default(false);
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'menu_item_id']);
        });

        // "Extras", "Choose a bread"... with selection rules.
        Schema::create('addon_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('name_hi', 80)->nullable();
            $table->unsignedTinyInteger('min_select')->default(0);
            $table->unsignedTinyInteger('max_select')->nullable(); // null = no limit
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['tenant_id', 'sort_order']);
        });

        Schema::create('addons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_group_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->string('name_hi', 80)->nullable();
            $table->decimal('price', 12, 2)->default(0);
            $table->enum('food_type', ['veg', 'non_veg', 'egg'])->default('veg');
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'addon_group_id']);
        });

        Schema::create('addon_group_menu_item', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('addon_group_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);

            $table->unique(['menu_item_id', 'addon_group_id']);
        });

        Schema::create('delivery_zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->enum('type', ['pincode', 'radius']);
            $table->json('pincodes')->nullable();
            $table->decimal('radius_km', 6, 2)->nullable();
            $table->decimal('fee', 12, 2)->default(0);
            $table->decimal('min_order', 12, 2)->default(0);
            $table->decimal('free_above', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['tenant_id', 'is_active']);
        });

        // A business's customers (guest checkout by phone; CRM fields arrive in Phase 6).
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20);
            $table->string('email', 160)->nullable();
            $table->unsignedInteger('orders_count')->default(0);
            $table->timestamp('last_order_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'phone']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->ulid('public_id')->unique();
            $table->string('tracking_token', 64);
            $table->unsignedInteger('number'); // per business: #1001, #1002...
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['delivery', 'takeaway', 'dine_in']);
            $table->enum('status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'])->default('pending');
            $table->timestamp('scheduled_for')->nullable();
            $table->string('customer_name', 120);
            $table->string('customer_phone', 20);
            $table->string('customer_email', 160)->nullable();
            $table->json('address')->nullable();
            $table->foreignId('delivery_zone_id')->nullable()->constrained()->nullOnDelete();
            $table->string('table_label', 40)->nullable();
            $table->text('notes')->nullable();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('tax_total', 12, 2);
            $table->decimal('delivery_fee', 12, 2)->default(0);
            $table->decimal('packaging_fee', 12, 2)->default(0);
            $table->decimal('discount_total', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->boolean('prices_include_tax')->default(false);
            $table->enum('payment_method', ['online', 'cod', 'counter']);
            $table->enum('payment_status', ['unpaid', 'pending', 'paid', 'failed', 'refund_due', 'refunded'])->default('unpaid');
            $table->string('cancel_reason', 255)->nullable();
            $table->string('locale', 5)->default('en');
            $table->dateTime('placed_at');
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status', 'placed_at']);
            $table->index(['tenant_id', 'placed_at']);
        });

        // Snapshots: an order keeps the names and prices it was placed with.
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 150);
            $table->string('name_hi', 150)->nullable();
            $table->string('variant_name', 60)->nullable();
            $table->json('addons')->nullable(); // [{ name, price }]
            $table->enum('food_type', ['veg', 'non_veg', 'egg']);
            $table->decimal('unit_price', 12, 2); // variant/base price + add-ons
            $table->unsignedSmallInteger('quantity');
            $table->decimal('tax_rate', 5, 2);
            $table->decimal('line_subtotal', 12, 2);
            $table->decimal('line_tax', 12, 2);
            $table->decimal('line_total', 12, 2);
            $table->string('notes', 200)->nullable();
            $table->timestamps();
        });

        Schema::create('order_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('status', 30);
            $table->string('note', 255)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at');

            $table->index(['order_id', 'id']);
        });

        // Card data never touches us: only Razorpay ids, amounts and states.
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20)->default('razorpay');
            $table->string('provider_order_id', 64)->unique();
            $table->string('provider_payment_id', 64)->nullable()->unique();
            $table->decimal('amount', 12, 2);
            $table->char('currency', 3)->default('INR');
            $table->enum('status', ['created', 'captured', 'failed', 'refunded'])->default('created');
            $table->string('method', 30)->nullable();
            $table->string('error', 255)->nullable();
            $table->timestamps();
        });

        // Staff alerts (new orders...), per user.
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_events');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('delivery_zones');
        Schema::dropIfExists('addon_group_menu_item');
        Schema::dropIfExists('addons');
        Schema::dropIfExists('addon_groups');
        Schema::dropIfExists('item_variants');
        Schema::table('menu_items', fn (Blueprint $t) => $t->dropColumn('tax_rate'));
        Schema::table('menu_categories', fn (Blueprint $t) => $t->dropColumn('tax_rate'));
    }
};
