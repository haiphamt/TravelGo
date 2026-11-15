<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('place_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'place_id']);
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('place_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->string('text', 500)->default('');
            $table->date('visited_on')->nullable();
            $table->timestamp('hidden_at')->nullable();
            $table->timestamps(6);
            $table->unique(['user_id', 'place_id']);
            $table->index(['place_id', 'hidden_at', 'id']);
        });

        DB::statement('ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5)');

        Schema::create('review_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->constrained()->cascadeOnDelete();
            $table->string('path')->unique();
            $table->string('mime', 32);
            $table->char('sha256', 64)->nullable();
            $table->unsignedTinyInteger('position');
            $table->timestamp('hidden_at')->nullable();
            $table->timestamps(6);
            $table->index(['review_id', 'hidden_at', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('review_photos');
        Schema::dropIfExists('reviews');
        Schema::dropIfExists('favorites');
    }
};
