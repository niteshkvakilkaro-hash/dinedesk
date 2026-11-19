<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chats with the NikoBite assistant (website visitors and signed-in businesses). The super admin
 * reads them in Platform → Chats and follows up on WhatsApp.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_chats', function (Blueprint $table) {
            $table->id();
            $table->ulid('public_id')->unique();
            $table->foreignId('tenant_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('visitor_name', 80)->nullable();
            $table->string('visitor_phone', 20)->nullable();
            $table->string('page', 200)->nullable();
            $table->json('messages');
            $table->string('status', 12)->default('new')->index(); // new | seen | closed
            $table->string('ip', 45)->nullable();
            $table->timestamp('last_message_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_chats');
    }
};
