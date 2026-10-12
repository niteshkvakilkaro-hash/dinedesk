<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Suppliers and purchase orders: order raw materials, receive them into stock. */
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20)->nullable();
            $table->string('email', 160)->nullable();
            $table->string('gstin', 15)->nullable();
            $table->string('notes', 300)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('number'); // PO-0001 per business
            $table->string('status', 12)->default('draft'); // draft | sent | received | cancelled
            $table->date('expected_on')->nullable();
            $table->string('notes', 300)->nullable();
            $table->decimal('total', 12, 2)->default(0);
            $table->dateTime('sent_at')->nullable();
            $table->dateTime('received_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['tenant_id', 'number']);
        });

        Schema::create('purchase_order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->decimal('received_quantity', 14, 3)->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_lines');
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('suppliers');
    }
};
