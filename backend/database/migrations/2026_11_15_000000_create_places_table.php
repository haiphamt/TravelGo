<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('places', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 80)->charset('ascii')->collation('ascii_bin')->unique();
            $table->string('source', 32)->charset('ascii')->collation('ascii_bin');
            $table->string('source_id', 128)->charset('ascii')->collation('ascii_bin');
            $table->unique(['source', 'source_id']);

            $table->string('name');
            $table->string('city', 32);
            $table->string('category', 32);
            $table->boolean('local')->default(false);
            $table->text('area')->nullable();
            $table->string('source_district', 80)->nullable();
            $table->decimal('price', 14, 2)->nullable();
            $table->text('hours')->nullable();
            $table->text('description')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();

            $table->text('image')->nullable();
            $table->json('images')->nullable();
            $table->json('products')->nullable();
            $table->json('facets')->nullable();
            $table->boolean('mobile')->nullable();
            $table->text('photo_credit')->nullable();
            $table->json('photo_source')->nullable();
            $table->json('local_profile')->nullable();

            $table->text('source_url')->nullable();
            $table->string('source_label')->nullable();
            $table->string('source_license')->nullable();
            $table->dateTime('source_updated_at', 6)->nullable();
            $table->dateTime('data_updated_at', 6)->nullable();
            $table->dateTime('imported_at', 6)->nullable();
            $table->json('source_metadata')->nullable();
            $table->boolean('reference_only')->default(true);
            $table->timestamps();

            $table->index(['city', 'local', 'category', 'id'], 'places_discovery_index');
        });

        DB::statement('ALTER TABLE places
            ADD CONSTRAINT places_lat_range CHECK (lat BETWEEN -90 AND 90),
            ADD CONSTRAINT places_lng_range CHECK (lng BETWEEN -180 AND 180),
            ADD CONSTRAINT places_price_nonnegative CHECK (price >= 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('places');
    }
};
