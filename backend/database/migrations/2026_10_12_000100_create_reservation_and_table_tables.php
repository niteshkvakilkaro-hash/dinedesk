<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Restaurant tables. Each has a secret QR token: the QR opens the menu for that table.
        Schema::create('dining_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('label', 40);
            $table->unsignedTinyInteger('seats');
            $table->string('area', 60)->nullable();
            $table->string('qr_token', 40)->unique();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active']);
        });

        // A running table: opened by the first QR order, closed when staff settle the bill.
        Schema::create('table_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dining_table_id')->constrained()->cascadeOnDelete();
            $table->string('status', 12)->default('open'); // open | closed
            $table->dateTime('opened_at');
            $table->dateTime('bill_requested_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('payment_mode', 12)->nullable(); // cash | upi | card | online | none
            $table->decimal('total', 12, 2)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'dining_table_id', 'status']);
        });

        // "Call waiter" / "Request bill" from the table's QR page.
        Schema::create('table_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dining_table_id')->constrained()->cascadeOnDelete();
            $table->foreignId('table_session_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 12); // waiter | bill
            $table->dateTime('created_at');
            $table->dateTime('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();

            $table->index(['tenant_id', 'resolved_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('dining_table_id')->nullable()->after('table_label')->constrained()->nullOnDelete();
            $table->foreignId('table_session_id')->nullable()->after('dining_table_id')->constrained()->nullOnDelete();
            // Diners ordering by QR may leave out their phone number.
            $table->string('customer_phone', 20)->nullable()->change();
        });

        // Weekly booking slots: a start time per weekday with a capacity in guests.
        Schema::create('reservation_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->char('day', 3); // mon … sun
            $table->char('time', 5); // HH:MM, business timezone
            $table->unsignedSmallInteger('capacity');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'day', 'time']);
        });

        Schema::create('reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('code', 8); // booking ID the guest uses to check or cancel
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20);
            $table->string('email', 160)->nullable();
            $table->unsignedSmallInteger('party_size');
            $table->date('date'); // business-local date
            $table->char('time', 5); // business-local slot time
            $table->dateTime('starts_at'); // UTC
            $table->dateTime('ends_at'); // UTC
            $table->foreignId('dining_table_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 16); // pending | confirmed | seated | completed | rejected | cancelled | no_show
            $table->string('source', 12)->default('website'); // website | phone | walk_in
            $table->string('notes', 500)->nullable();
            $table->string('staff_note', 300)->nullable();
            $table->string('cancelled_by', 12)->nullable(); // guest | staff
            $table->dateTime('decided_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('reminder_sent_at')->nullable();
            $table->string('locale', 2)->default('en');
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'date', 'status']);
            $table->index(['tenant_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('reservation_slots');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('table_session_id');
            $table->dropConstrainedForeignId('dining_table_id');
        });
        Schema::dropIfExists('table_requests');
        Schema::dropIfExists('table_sessions');
        Schema::dropIfExists('dining_tables');
    }
};
