<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Orders that came through Swiggy / Zomato (entered at the POS), with the app's order id and commission. */
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('channel', 12)->nullable()->after('source');
            $table->string('channel_ref', 40)->nullable()->after('channel');
            $table->decimal('commission', 10, 2)->default(0)->after('channel_ref');
            $table->index(['tenant_id', 'channel']);
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'channel']);
            $table->dropColumn(['channel', 'channel_ref', 'commission']);
        });
    }
};
