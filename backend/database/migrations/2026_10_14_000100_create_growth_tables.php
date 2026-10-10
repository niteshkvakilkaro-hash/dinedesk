<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------- Inventory ----------
        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('unit', 8); // kg | g | l | ml | pcs
            $table->decimal('stock', 14, 3)->default(0);
            $table->decimal('low_stock_level', 14, 3)->default(0);
            $table->decimal('cost_per_unit', 12, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->dateTime('low_alerted_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'name']);
        });

        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('type', 12); // purchase | sale | return | wastage | adjust
            $table->decimal('quantity', 14, 3); // + in, − out
            $table->decimal('balance_after', 14, 3);
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 200)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at');

            $table->index(['tenant_id', 'inventory_item_id', 'created_at']);
        });

        // What one serving uses (per size when the dish has sizes).
        Schema::create('recipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_variant_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 14, 3);

            $table->unique(['menu_item_id', 'item_variant_id', 'inventory_item_id'], 'recipes_unique_line');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('item_variant_id')->nullable()->after('menu_item_id')->constrained()->nullOnDelete();
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->dateTime('stock_deducted_at')->nullable()->after('placed_at');
            $table->string('discount_label', 120)->nullable()->after('discount_total');
            $table->boolean('marketing_opt_in')->default(false)->after('locale');
        });

        // ---------- Coupons ----------
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);
            $table->string('description', 200)->nullable();
            $table->string('type', 8); // flat | percent
            $table->decimal('value', 10, 2);
            $table->decimal('max_discount', 10, 2)->nullable(); // cap for percent
            $table->decimal('min_order', 10, 2)->default(0);
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->unsignedInteger('usage_limit')->nullable(); // total uses
            $table->unsignedInteger('per_customer_limit')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->boolean('online')->default(true);
            $table->boolean('pos')->default(true);
            $table->boolean('is_public')->default(false); // shown on the website's Offers page
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->dateTime('reversed_at')->nullable();
            $table->dateTime('created_at');
        });

        // ---------- Loyalty and gift cards ----------
        Schema::create('loyalty_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 8); // earn | redeem | reverse | adjust | expire
            $table->integer('points');
            $table->integer('balance_after');
            $table->string('note', 200)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at');

            $table->index(['tenant_id', 'customer_id']);
        });

        Schema::create('gift_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 19); // XXXX-XXXX-XXXX-XXXX
            $table->decimal('initial_value', 10, 2);
            $table->decimal('balance', 10, 2);
            $table->string('issued_to', 120)->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('status', 8)->default('active'); // active | void
            $table->date('expires_on')->nullable();
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
        });

        Schema::create('gift_card_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('gift_card_id')->constrained()->cascadeOnDelete();
            $table->string('type', 8); // issue | redeem | refund | void
            $table->decimal('amount', 10, 2);
            $table->decimal('balance_after', 10, 2);
            $table->string('mode', 12)->nullable(); // how an issued card was paid for
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at');
        });

        // ---------- Banners and campaigns ----------
        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('placement', 8); // bar | popup | offer
            $table->string('title', 120);
            $table->string('title_hi', 120)->nullable();
            $table->string('text', 300)->nullable();
            $table->string('text_hi', 300)->nullable();
            $table->string('cta_label', 40)->nullable();
            $table->string('cta_link', 40)->nullable(); // /menu, /reserve, /offers …
            $table->string('coupon_code', 30)->nullable();
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('channel', 10); // whatsapp | sms | email
            $table->text('message');
            $table->json('audience'); // filters used
            $table->unsignedInteger('recipients')->default(0);
            $table->string('status', 10)->default('sent');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('sent_at')->nullable();
            $table->timestamps();
        });

        // ---------- CRM ----------
        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('total_spent', 12, 2)->default(0)->after('orders_count');
            $table->unsignedInteger('visits')->default(0)->after('total_spent'); // completed orders + seated bookings
            $table->integer('loyalty_points')->default(0)->after('visits');
            $table->date('birthday')->nullable()->after('loyalty_points');
            $table->date('anniversary')->nullable()->after('birthday');
            $table->boolean('dates_opt_in')->default(false)->after('anniversary');
            $table->boolean('marketing_opt_in')->default(false)->after('dates_opt_in');
            $table->dateTime('marketing_opt_in_at')->nullable()->after('marketing_opt_in');
            $table->json('tags')->nullable()->after('marketing_opt_in_at');
            $table->string('notes', 500)->nullable()->after('tags');
            $table->string('unsubscribe_token', 40)->nullable()->unique()->after('notes');
        });

        // ---------- Feedback ----------
        Schema::create('feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('rating'); // 1–5
            $table->unsignedTinyInteger('food')->nullable();
            $table->unsignedTinyInteger('service')->nullable();
            $table->string('comment', 600)->nullable();
            $table->string('name', 60)->nullable(); // shown as "Asha V." if published
            $table->boolean('consent_public')->default(false);
            $table->boolean('is_published')->default(false);
            $table->string('reply', 600)->nullable();
            $table->dateTime('created_at');

            $table->index(['tenant_id', 'is_published']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback');
        Schema::table('customers', fn (Blueprint $t) => $t->dropColumn(['total_spent', 'visits', 'loyalty_points', 'birthday', 'anniversary', 'dates_opt_in', 'marketing_opt_in', 'marketing_opt_in_at', 'tags', 'notes', 'unsubscribe_token']));
        foreach (['campaigns', 'banners', 'gift_card_transactions', 'gift_cards', 'loyalty_ledger', 'coupon_redemptions', 'coupons'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['stock_deducted_at', 'discount_label', 'marketing_opt_in']));
        Schema::table('order_items', fn (Blueprint $t) => $t->dropConstrainedForeignId('item_variant_id'));
        Schema::dropIfExists('recipes');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('inventory_items');
    }
};
