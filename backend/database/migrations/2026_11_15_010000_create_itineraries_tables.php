<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('itineraries', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 80);
            $table->date('date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('note', 500)->nullable();
            $table->unsignedBigInteger('budget')->nullable();
            $table->longText('cover')->nullable();
            $table->string('source', 16)->default('manual');
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->index(['user_id', 'updated_at']);
        });

        Schema::create('itinerary_stops', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('itinerary_id')->constrained('itineraries')->cascadeOnDelete();
            // Reuse the places migration owned by Huu Hieu; API IDs remain public strings.
            $table->foreignId('place_id')->constrained('places')->restrictOnDelete();
            $table->unsignedTinyInteger('position');
            $table->date('date')->nullable();
            $table->char('time', 5);
            $table->string('note', 180)->nullable();
            $table->unsignedBigInteger('estimated_cost')->nullable();
            $table->json('snapshot');
            $table->unique(['itinerary_id', 'place_id']);
            $table->unique(['itinerary_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('itinerary_stops');
        Schema::dropIfExists('itineraries');
    }
};
