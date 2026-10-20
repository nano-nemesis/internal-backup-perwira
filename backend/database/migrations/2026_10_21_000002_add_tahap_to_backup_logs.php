<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Tahap backup yang sedang berjalan (ambil, salin, periksa, doctor, ...) untuk tampilan realtime. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('backup_logs', function (Blueprint $table) {
            $table->string('tahap', 20)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('backup_logs', function (Blueprint $table) {
            $table->dropColumn('tahap');
        });
    }
};
