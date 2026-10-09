<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per business: which theme, and the owner's customisation within its guardrails.
        Schema::create('theme_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('theme', 20)->default('haveli');
            $table->char('primary_color', 7)->nullable(); // null = theme default
            $table->char('accent_color', 7)->nullable();
            $table->json('logo')->nullable();               // ImageService payload
            $table->json('cover')->nullable();
            $table->json('sections');                        // [{ key, visible }] in display order
            $table->timestamps();
        });

        // Phase 2 ships the read side of the menu (public Menu page). Phase 3 adds
        // management, variants, add-ons and CSV import on top of these tables.
        Schema::create('menu_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('name_hi', 100)->nullable();
            $table->string('slug', 120);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'is_active', 'sort_order']);
        });

        Schema::create('menu_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('menu_category_id')->constrained()->restrictOnDelete();
            $table->string('name', 150);
            $table->string('name_hi', 150)->nullable();
            $table->text('description')->nullable();
            $table->text('description_hi')->nullable();
            $table->decimal('price', 12, 2);
            $table->enum('food_type', ['veg', 'non_veg', 'egg'])->default('veg');
            $table->unsignedTinyInteger('spice_level')->default(0);
            $table->json('allergens')->nullable();
            $table->boolean('is_available')->default(true);
            $table->boolean('is_bestseller')->default(false);
            $table->boolean('is_chefs_special')->default(false);
            $table->json('image')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_demo')->default(false);
            $table->softDeletes();
            $table->timestamps();

            $table->index(['tenant_id', 'menu_category_id', 'sort_order']);
            $table->index(['tenant_id', 'is_bestseller']);
        });

        Schema::create('gallery_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->json('image');
            $table->string('alt_text', 200);
            $table->string('caption', 200)->nullable();
            $table->enum('category', ['food', 'interior', 'events'])->default('food');
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_demo')->default(false);
            $table->timestamps();

            $table->index(['tenant_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_images');
        Schema::dropIfExists('menu_items');
        Schema::dropIfExists('menu_categories');
        Schema::dropIfExists('theme_settings');
    }
};
