<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('node_schedules', function (Blueprint $table) {
            $table->id();
            $table->uuid('node_id')->unique();
            $table->foreign('node_id')->references('id')->on('nodes')->onDelete('cascade');
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->integer('interval_hours')->default(24);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('node_schedules');
    }
};
