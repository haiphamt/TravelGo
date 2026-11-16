<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('places', function (Blueprint $table) {
            $table->string('moderation_status', 16)->nullable();
        });

        Schema::create('contributions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('place_id')->nullable()->constrained()->nullOnDelete();
            $table->string('public_place_id', 80)->index();
            $table->string('kind', 16);
            $table->string('actor', 16);
            $table->string('status', 16)->default('pending');
            $table->unsignedInteger('version')->default(1);
            $table->json('payload');
            $table->json('snapshot')->nullable();
            $table->char('base_revision', 64)->nullable();
            $table->timestamp('approved_at', 6)->nullable();
            $table->timestamps(6);
            $table->index(['user_id', 'status', 'created_at']);
            $table->index(['status', 'kind', 'created_at']);
        });

        Schema::create('moderation_events', function (Blueprint $table) {
            $table->id();
            $table->foreignUuid('contribution_id')->constrained('contributions')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('actor', 16);
            $table->string('status', 16);
            $table->string('reason', 600);
            $table->unsignedInteger('version');
            $table->timestamp('created_at', 6);
            $table->unique(['contribution_id', 'version']);
        });

        Schema::create('ownership_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('place_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('contribution_id')->constrained('contributions')->restrictOnDelete();
            $table->timestamp('revoked_at', 6)->nullable();
            $table->timestamps(6);
        });

        Schema::create('moderation_place_states', function (Blueprint $table) {
            $table->foreignId('place_id')->primary()->constrained()->cascadeOnDelete();
            $table->json('baseline');
            $table->char('materialized_revision', 64);
        });

        Schema::create('owner_replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('review_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('review_version', 40);
            $table->string('text', 500);
            $table->timestamps(6);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('owner_replies');
        Schema::dropIfExists('moderation_place_states');
        Schema::dropIfExists('ownership_grants');
        Schema::dropIfExists('moderation_events');
        Schema::dropIfExists('contributions');
        Schema::table('places', fn (Blueprint $table) => $table->dropColumn('moderation_status'));
    }
};
