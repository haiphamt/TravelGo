<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trip_rooms', function (Blueprint $table) {
            $table->id();
            $table->char('code', 8)->charset('ascii')->collation('ascii_bin')->unique();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->string('title', 80);
            $table->date('date')->nullable();
            $table->unsignedTinyInteger('desired_stops');
            $table->enum('phase', ['preparing', 'voting', 'finalized'])->default('preparing');
            $table->json('result')->nullable();
            $table->json('itinerary')->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->timestamps();
        });

        Schema::create('trip_room_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('trip_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('display_name', 40);
            $table->unique(['room_id', 'user_id']);
        });

        Schema::create('trip_room_places', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('trip_rooms')->cascadeOnDelete();
            $table->foreignId('place_id')->constrained('places')->restrictOnDelete();
            $table->foreignId('proposed_by')->constrained('users')->restrictOnDelete();
            $table->string('name');
            $table->unique(['room_id', 'place_id']);
        });

        Schema::create('trip_room_votes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('room_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('place_id');
            $table->unique(['room_id', 'user_id', 'place_id']);
            $table->foreign(['room_id', 'user_id'])->references(['room_id', 'user_id'])
                ->on('trip_room_members')->cascadeOnDelete();
            $table->foreign(['room_id', 'place_id'])->references(['room_id', 'place_id'])
                ->on('trip_room_places')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trip_room_votes');
        Schema::dropIfExists('trip_room_places');
        Schema::dropIfExists('trip_room_members');
        Schema::dropIfExists('trip_rooms');
    }
};
