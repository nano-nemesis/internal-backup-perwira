<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migration: tambah 'virtualizor_db' ke enum type di tabel nodes.
 *
 * Karena MySQL enum tidak bisa di-alter langsung via Blueprint enum(),
 * kita modifikasi via raw SQL ALTER TABLE.
 *
 * File: backend/database/migrations/2026_06_09_000001_add_virtualizor_db_type_to_nodes.php
 */
return new class extends Migration
{
    public function up(): void
    {
        // MySQL/MariaDB: modify enum column secara langsung
        DB::statement(
            "ALTER TABLE nodes MODIFY COLUMN type ENUM('mikrotik', 'database', 'virtualizor_db') NOT NULL"
        );
    }

    public function down(): void
    {
        // Rollback: hapus type virtualizor_db dari enum
        // PERHATIAN: pastikan tidak ada data dengan type='virtualizor_db' sebelum rollback
        DB::statement(
            "ALTER TABLE nodes MODIFY COLUMN type ENUM('mikrotik', 'database') NOT NULL"
        );
    }
};
