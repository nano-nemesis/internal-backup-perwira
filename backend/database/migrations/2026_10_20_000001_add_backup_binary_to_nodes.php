<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Backup biner MikroTik (.backup) per node. Default mati: butuh policy write + ftp
 * di user router, yang belum dimiliki user grup 'read' di node lama.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->boolean('backup_binary')->default(false)->after('db_password');
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn('backup_binary');
        });
    }
};
