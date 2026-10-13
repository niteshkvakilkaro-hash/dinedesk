<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Offline POS: the counter's own id for a sale, so a sale sent twice is saved once. */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('client_ref', 40)->nullable()->after('source');
            $table->unique(['tenant_id', 'client_ref']);
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropUnique(['tenant_id', 'client_ref']);
            $table->dropColumn('client_ref');
        });
    }
};
