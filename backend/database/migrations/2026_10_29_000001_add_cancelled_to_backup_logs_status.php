<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Status 'cancelled': backup yang dihentikan pengguna lewat tombol Batalkan.
 * Enum MySQL tidak bisa diubah lewat Blueprint, jadi pakai ALTER TABLE langsung.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(
            "ALTER TABLE backup_logs MODIFY COLUMN status ENUM('pending', 'running', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'pending'"
        );
    }

    public function down(): void
    {
        // Baris yang dibatalkan dianggap gagal supaya ALTER tidak menolak nilainya.
        DB::table('backup_logs')->where('status', 'cancelled')->update(['status' => 'failed']);
        DB::statement(
            "ALTER TABLE backup_logs MODIFY COLUMN status ENUM('pending', 'running', 'success', 'failed') NOT NULL DEFAULT 'pending'"
        );
    }
};
