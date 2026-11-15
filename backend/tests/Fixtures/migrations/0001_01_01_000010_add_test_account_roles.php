<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Test fixture only. The auth task owns the production account role schema.
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'role')) {
            Schema::table('users', fn (Blueprint $table) => $table->string('role', 16)->default('user'));
        }
    }

    public function down(): void {}
};
