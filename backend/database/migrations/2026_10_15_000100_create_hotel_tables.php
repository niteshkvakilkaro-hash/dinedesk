<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 7 — hotel module: room types and rates, rooms with housekeeping status and an
 * in-room dining QR, room bookings with a folio (room nights, room-service food, extras,
 * payments), guest ID documents (optional, encrypted, access-logged) and banquet enquiries.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('room_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('slug', 80);
            $table->string('name', 80);
            $table->string('name_hi', 80)->nullable();
            $table->text('description')->nullable();
            $table->text('description_hi')->nullable();
            $table->json('photos')->nullable(); // [{image, alt}]
            $table->json('amenities')->nullable(); // keys from RoomType::AMENITIES
            $table->string('bed', 60)->nullable(); // "1 king bed"
            $table->unsignedSmallInteger('size_sqft')->nullable();
            $table->unsignedTinyInteger('base_occupancy')->default(2); // adults included in the price
            $table->unsignedTinyInteger('max_adults')->default(2);
            $table->unsignedTinyInteger('max_children')->default(1);
            $table->decimal('base_price', 12, 2); // per night, before GST
            $table->decimal('weekend_price', 12, 2)->nullable();
            $table->decimal('extra_adult_price', 12, 2)->default(0); // per night, above base_occupancy
            $table->decimal('extra_child_price', 12, 2)->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'slug']);
        });

        // Seasonal prices: override the base / weekend price between two dates.
        Schema::create('room_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_type_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->decimal('price', 12, 2);
            $table->decimal('weekend_price', 12, 2)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'room_type_id', 'starts_on']);
        });

        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_type_id')->constrained()->cascadeOnDelete();
            $table->string('number', 20);
            $table->string('floor', 20)->nullable();
            $table->string('housekeeping', 12)->default('clean'); // clean | dirty | inspected | out_of_order
            $table->string('housekeeping_note', 200)->nullable();
            $table->dateTime('housekeeping_at')->nullable();
            $table->string('qr_token', 40)->unique();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['tenant_id', 'number']);
        });

        Schema::create('housekeeping_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->string('from', 12)->nullable();
            $table->string('to', 12);
            $table->string('note', 200)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->dateTime('created_at');

            $table->index(['tenant_id', 'room_id', 'created_at']);
        });

        Schema::create('room_bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->ulid('public_id')->unique();
            $table->string('code', 8);
            $table->string('access_token', 64);
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('room_type_id')->constrained();
            $table->foreignId('room_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20);
            $table->string('email', 160)->nullable();
            $table->unsignedTinyInteger('adults');
            $table->unsignedTinyInteger('children')->default(0);
            $table->date('check_in');
            $table->date('check_out');
            $table->unsignedSmallInteger('nights');
            $table->json('rates'); // [{date, price, tax_rate, tax}] as quoted
            $table->decimal('room_total', 12, 2); // before GST
            $table->decimal('tax_total', 12, 2);
            $table->decimal('total', 12, 2);
            $table->decimal('advance_due', 12, 2)->default(0);
            $table->string('status', 12); // pending | confirmed | checked_in | checked_out | cancelled | no_show
            $table->string('source', 12); // website | phone | walk_in | email | other
            $table->string('arrival_time', 5)->nullable();
            $table->text('requests')->nullable();
            $table->text('staff_note')->nullable();
            $table->string('company', 120)->nullable();
            $table->string('gstin', 15)->nullable();
            $table->string('id_type', 20)->nullable();
            $table->string('id_last4', 4)->nullable();
            $table->dateTime('hold_expires_at')->nullable(); // online advance not paid yet
            $table->dateTime('confirmed_at')->nullable();
            $table->dateTime('checked_in_at')->nullable();
            $table->dateTime('checked_out_at')->nullable();
            $table->string('cancelled_by', 10)->nullable(); // guest | staff | system
            $table->string('cancel_reason', 255)->nullable();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->string('locale', 5)->default('en');
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'status', 'check_in']);
            $table->index(['tenant_id', 'room_type_id', 'check_in', 'check_out']);
        });

        // Everything charged to the stay: room nights, room-service food, extras, discounts.
        Schema::create('folio_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_booking_id')->constrained()->cascadeOnDelete();
            $table->string('type', 10); // room | food | extra | discount
            $table->string('description', 200);
            $table->date('service_date');
            $table->unsignedSmallInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('amount', 12, 2); // before GST (negative for a discount)
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->string('sac', 10)->nullable();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('voided_at')->nullable();
            $table->string('void_reason', 200)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'room_booking_id']);
        });

        // Money for a stay: advances (online or at the desk), payments at check-out, refunds.
        Schema::create('folio_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_booking_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 10); // advance | payment | refund
            $table->string('mode', 12); // cash | upi | card | online | other
            $table->decimal('amount', 12, 2); // always positive; a refund takes money back
            $table->string('reference', 80)->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('received_at');
            $table->date('business_date');

            $table->index(['tenant_id', 'business_date']);
        });

        Schema::create('guest_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_booking_id')->constrained()->cascadeOnDelete();
            $table->string('doc_type', 20); // aadhaar | passport | driving_licence | voter_id | other
            $table->string('path', 255); // private disk, contents encrypted
            $table->string('mime', 40);
            $table->unsignedInteger('size');
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('delete_after');
            $table->timestamps();
        });

        Schema::create('banquet_enquiries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('phone', 20);
            $table->string('email', 160)->nullable();
            $table->string('event_type', 20); // wedding | birthday | corporate | anniversary | other
            $table->date('event_date')->nullable();
            $table->unsignedSmallInteger('guests')->nullable();
            $table->text('message')->nullable();
            $table->string('status', 12)->default('new'); // new | contacted | quoted | booked | lost
            $table->date('follow_up_on')->nullable();
            $table->json('notes')->nullable(); // [{at, by, text}]
            $table->string('locale', 5)->default('en');
            $table->timestamps();

            $table->index(['tenant_id', 'status', 'created_at']);
        });

        // Room service: a new order type, charged to the room's folio.
        Schema::table('orders', function (Blueprint $table) {
            $table->enum('type', ['delivery', 'takeaway', 'dine_in', 'room_service'])->change();
            $table->enum('payment_method', ['online', 'cod', 'counter', 'room'])->change();
            $table->foreignId('room_booking_id')->nullable()->after('table_session_id')->constrained()->nullOnDelete();
        });

        // Online advances for room bookings use the same Razorpay payment records.
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('order_id')->nullable()->change();
            $table->foreignId('room_booking_id')->nullable()->after('order_id')->constrained()->cascadeOnDelete();
        });

        // The check-out bill of a stay.
        Schema::table('invoices', function (Blueprint $table) {
            $table->foreignId('room_booking_id')->nullable()->after('table_session_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', fn (Blueprint $t) => $t->dropConstrainedForeignId('room_booking_id'));
        Schema::table('payments', fn (Blueprint $t) => $t->dropConstrainedForeignId('room_booking_id'));
        Schema::table('orders', function (Blueprint $t) {
            $t->dropConstrainedForeignId('room_booking_id');
        });
        Schema::dropIfExists('banquet_enquiries');
        Schema::dropIfExists('guest_documents');
        Schema::dropIfExists('folio_payments');
        Schema::dropIfExists('folio_items');
        Schema::dropIfExists('room_bookings');
        Schema::dropIfExists('housekeeping_logs');
        Schema::dropIfExists('rooms');
        Schema::dropIfExists('room_rates');
        Schema::dropIfExists('room_types');
    }
};
