<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vps_metrics', function (Blueprint $table) {
            $table->id();
            $table->timestamp('recorded_at');
            $table->float('cpu_usage_percent');
            $table->integer('memory_used_mb');
            $table->integer('memory_total_mb');
            $table->float('disk_used_gb');
            $table->float('disk_total_gb');
            $table->float('load_average');
            $table->index('recorded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vps_metrics');
    }
};
