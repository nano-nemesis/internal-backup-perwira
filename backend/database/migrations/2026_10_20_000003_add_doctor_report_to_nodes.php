<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Laporan doctor terakhir per node (App\Support\RouterDoctor) — hanya yang terbaru, tanpa riwayat. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->json('doctor_report')->nullable()->after('routeros_checked_at');
            $table->timestamp('doctor_checked_at')->nullable()->after('doctor_report');
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn(['doctor_report', 'doctor_checked_at']);
        });
    }
};
