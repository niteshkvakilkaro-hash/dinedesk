<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * On MariaDB (and MySQL with explicit_defaults_for_timestamp off) the first non-null
     * TIMESTAMP column of a table silently gets ON UPDATE CURRENT_TIMESTAMP, so any update to
     * the row (a wrong OTP attempt, ending a support session) moved its expiry to "now".
     * DATETIME columns never do that.
     */
    public function up(): void
    {
        foreach (['otp_codes', 'support_sessions'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->dateTime('expires_at')->change();
            });
        }
    }

    public function down(): void
    {
        foreach (['otp_codes', 'support_sessions'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->timestamp('expires_at')->change();
            });
        }
    }
};
