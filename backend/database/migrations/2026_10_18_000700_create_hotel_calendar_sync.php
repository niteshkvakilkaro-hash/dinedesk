<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Calendar sync (iCal) with booking sites: each room type has a private calendar link the
     * sites read (nights with no room free), and the sites' calendars block a room here.
     */
    public function up(): void
    {
        Schema::table('room_types', function (Blueprint $table) {
            $table->string('ical_token', 40)->nullable()->unique();
        });

        Schema::create('room_calendar_feeds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_type_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->text('url'); // encrypted: the link itself is a secret
            $table->dateTime('synced_at')->nullable();
            $table->string('error', 200)->nullable();
            $table->unsignedSmallInteger('events')->default(0);
            $table->timestamps();
        });

        Schema::create('room_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('room_calendar_feed_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('uid', 255)->nullable();
            // Nights from starts_on up to (not including) ends_on, like a stay.
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('summary', 120)->nullable();
            $table->timestamps();
            $table->index(['tenant_id', 'room_type_id', 'starts_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('room_blocks');
        Schema::dropIfExists('room_calendar_feeds');
        Schema::table('room_types', function (Blueprint $table) {
            $table->dropUnique(['ical_token']);
            $table->dropColumn('ical_token');
        });
    }
};
