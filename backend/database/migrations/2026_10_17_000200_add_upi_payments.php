<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pay by UPI to the restaurant's own UPI ID. There is no gateway to confirm it, so the
     * guest may add the UPI reference (UTR) and staff mark the payment as received.
     */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->enum('payment_method', ['online', 'cod', 'counter', 'room', 'upi'])->change();
            $table->string('payment_reference', 40)->nullable()->after('payment_status');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('payment_reference');
            $table->enum('payment_method', ['online', 'cod', 'counter', 'room'])->change();
        });
    }
};
