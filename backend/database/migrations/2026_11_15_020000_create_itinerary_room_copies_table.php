<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('itinerary_stops', function (Blueprint $table) {
            $table->string('kept_revision', 200)->nullable();
        });

        Schema::create('itinerary_room_copies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('trip_rooms')->restrictOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('room_revision');
            $table->foreignUuid('itinerary_id')->constrained('itineraries')->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['room_id', 'user_id', 'room_revision'], 'itinerary_room_copy_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('itinerary_room_copies');
        Schema::table('itinerary_stops', fn (Blueprint $table) => $table->dropColumn('kept_revision'));
    }
};
