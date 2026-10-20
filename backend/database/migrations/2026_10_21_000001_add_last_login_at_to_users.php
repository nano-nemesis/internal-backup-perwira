<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Waktu login berhasil terakhir, untuk kolom "Login terakhir" di menu Pengguna. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_login_at')->nullable()->after('is_active');
        });

        // Isi awal dari Log Sistem supaya kolomnya tidak kosong sampai semua orang login ulang.
        // Log dipangkas berkala, jadi akun yang lama tidak login tetap kosong (= belum tercatat).
        if (Schema::hasTable('activity_logs')) {
            DB::statement(
                "UPDATE users SET last_login_at = (SELECT MAX(created_at) FROM activity_logs"
                . " WHERE activity_logs.aksi = 'login.berhasil' AND activity_logs.user_id = users.id)"
            );
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('last_login_at');
        });
    }
};
