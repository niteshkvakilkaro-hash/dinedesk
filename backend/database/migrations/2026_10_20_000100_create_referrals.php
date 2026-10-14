<?php

use App\Modules\Referrals\Services\ReferralCodes;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Refer a business: each main business has a referral code; a business that signed up
     * with one remembers who referred it. Its first paid subscription payment earns both
     * a reward (free days), stored in referral_rewards until it is applied.
     */
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->string('referral_code', 12)->nullable()->unique()->after('parent_tenant_id');
            $table->foreignId('referred_by_tenant_id')->nullable()->after('referral_code')->constrained('tenants')->nullOnDelete();
            // Set once, when the first paid payment earned the rewards (never rewarded twice).
            $table->timestamp('referral_rewarded_at')->nullable()->after('referred_by_tenant_id');
        });

        Schema::create('referral_rewards', function (Blueprint $table) {
            $table->id();
            // Who gets the free days.
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            // The new business whose first payment earned it.
            $table->foreignId('referred_tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->enum('role', ['referrer', 'referred']);
            $table->unsignedSmallInteger('days');
            // pending: not yet added (the business's plan renews automatically on Razorpay).
            $table->enum('status', ['pending', 'applied'])->default('pending');
            // trial (trial end moved), period (end of a paid period that won't renew moved), manual (super admin).
            $table->string('applied_to', 12)->nullable();
            $table->dateTime('applied_at')->nullable();
            $table->dateTime('new_end')->nullable();
            $table->string('note', 255)->nullable();
            $table->foreignId('applied_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'referred_tenant_id']);
            $table->index(['status', 'tenant_id']);
        });

        // Codes for the businesses that already exist (main businesses that are not demos).
        DB::table('tenants')->whereNull('parent_tenant_id')->where('is_demo', false)->whereNull('referral_code')->orderBy('id')->pluck('id')
            ->each(fn ($id) => DB::table('tenants')->where('id', $id)->update(['referral_code' => ReferralCodes::unusedCode()]));
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_rewards');
        Schema::table('tenants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('referred_by_tenant_id');
            $table->dropUnique(['referral_code']);
            $table->dropColumn(['referral_code', 'referral_rewarded_at']);
        });
    }
};
