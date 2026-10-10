<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Where an order came from, and who entered it (POS / waiter).
        Schema::table('orders', function (Blueprint $table) {
            $table->string('source', 12)->default('website')->after('type'); // website | qr | pos | waiter
            $table->foreignId('created_by')->nullable()->after('source')->constrained('users')->nullOnDelete();
        });

        // Kitchen order tickets: what the kitchen cooks, one per order sent to it.
        Schema::create('kots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number'); // per business, K-1, K-2…
            $table->string('status', 12)->default('new'); // new | preparing | ready | served | cancelled
            $table->string('order_type', 12);
            $table->string('table_label', 40)->nullable();
            $table->string('notes', 500)->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('ready_at')->nullable();
            $table->dateTime('served_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'number']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('kot_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('kot_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 150);
            $table->string('variant_name', 60)->nullable();
            $table->string('addons', 300)->nullable();
            $table->string('food_type', 8);
            $table->unsignedSmallInteger('quantity');
            $table->string('notes', 200)->nullable();
            $table->boolean('done')->default(false);
        });

        // GST invoices (Tax invoice when the business has a GSTIN, otherwise a plain bill).
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->ulid('public_id')->unique();
            $table->string('number', 30); // INV/2026-27/0001
            $table->string('financial_year', 7); // 2026-27
            $table->unsignedInteger('sequence');
            $table->foreignId('table_session_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 12); // tax_invoice | bill
            $table->string('status', 12)->default('unpaid'); // unpaid | paid | void
            $table->json('seller'); // name, address, gstin, fssai, phone (snapshot)
            $table->json('buyer')->nullable(); // name, phone, gstin
            $table->decimal('items_total', 12, 2); // before discount, without GST
            $table->decimal('discount', 12, 2)->default(0);
            $table->string('discount_reason', 200)->nullable();
            $table->decimal('taxable_value', 12, 2);
            $table->decimal('cgst', 12, 2);
            $table->decimal('sgst', 12, 2);
            $table->decimal('charges', 12, 2)->default(0); // packaging + delivery (not taxed here)
            $table->decimal('round_off', 6, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->decimal('paid', 12, 2)->default(0);
            $table->boolean('prices_include_tax')->default(false);
            $table->string('void_reason', 200)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('issued_at');
            $table->date('business_date'); // business-local day, for the day-end report
            $table->timestamps();

            $table->unique(['tenant_id', 'financial_year', 'sequence']);
            $table->index(['tenant_id', 'business_date']);
        });

        Schema::create('invoice_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->string('description', 250);
            $table->string('sac', 10)->default('996331'); // restaurant services
            $table->unsignedSmallInteger('quantity');
            $table->decimal('unit_price', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('taxable_value', 12, 2);
            $table->decimal('tax_rate', 5, 2);
            $table->decimal('cgst', 12, 2);
            $table->decimal('sgst', 12, 2);
            $table->decimal('total', 12, 2);
        });

        Schema::create('invoice_order', function (Blueprint $table) {
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->primary(['invoice_id', 'order_id']);
        });

        // Money received against a bill (split and mixed payments are several rows).
        Schema::create('bill_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invoice_id')->constrained()->cascadeOnDelete();
            $table->string('mode', 12); // cash | upi | card | online | other
            $table->decimal('amount', 12, 2);
            $table->string('reference', 80)->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('received_at');
            $table->date('business_date');

            $table->index(['tenant_id', 'business_date']);
        });

        // Day-end closing: the day's figures as they were, plus the cash count.
        Schema::create('day_closings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->date('business_date');
            $table->decimal('opening_cash', 12, 2)->default(0);
            $table->decimal('expected_cash', 12, 2);
            $table->decimal('counted_cash', 12, 2);
            $table->decimal('difference', 12, 2);
            $table->string('notes', 500)->nullable();
            $table->json('summary');
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'business_date']);
        });

        // Floor plan position and the "being cleaned" state.
        Schema::table('dining_tables', function (Blueprint $table) {
            $table->unsignedSmallInteger('pos_x')->nullable()->after('area');
            $table->unsignedSmallInteger('pos_y')->nullable()->after('pos_x');
            $table->string('shape', 8)->default('square')->after('pos_y'); // square | round | long
            $table->dateTime('cleaning_since')->nullable()->after('is_active');
        });

        // Merged tables: the second table's session points at the one it joined.
        Schema::table('table_sessions', function (Blueprint $table) {
            $table->foreignId('merged_into')->nullable()->after('status')->constrained('table_sessions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('table_sessions', fn (Blueprint $t) => $t->dropConstrainedForeignId('merged_into'));
        Schema::table('dining_tables', fn (Blueprint $t) => $t->dropColumn(['pos_x', 'pos_y', 'shape', 'cleaning_since']));
        Schema::dropIfExists('day_closings');
        Schema::dropIfExists('bill_payments');
        Schema::dropIfExists('invoice_order');
        Schema::dropIfExists('invoice_lines');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('kot_items');
        Schema::dropIfExists('kots');
        Schema::table('orders', function (Blueprint $t) {
            $t->dropConstrainedForeignId('created_by');
            $t->dropColumn('source');
        });
    }
};
