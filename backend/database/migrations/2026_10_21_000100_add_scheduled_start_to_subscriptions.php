<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Paying during the trial keeps the trial: the Razorpay subscription is created with
     * start_at = trial end, so the first charge happens then. starts_at remembers that date;
     * "scheduled" is a subscription the owner has authorised that hasn't started yet.
     */
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->enum('status', ['trialing', 'pending', 'scheduled', 'active', 'past_due', 'halted', 'cancelled', 'expired'])->default('trialing')->change();
            $table->timestamp('starts_at')->nullable()->after('trial_ends_at');
        });
    }

    public function down(): void
    {
        DB::table('subscriptions')->where('status', 'scheduled')->update(['status' => 'pending']);
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn('starts_at');
            $table->enum('status', ['trialing', 'pending', 'active', 'past_due', 'halted', 'cancelled', 'expired'])->default('trialing')->change();
        });
    }
};
