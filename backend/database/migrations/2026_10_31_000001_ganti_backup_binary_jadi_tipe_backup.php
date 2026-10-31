<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * MikroTik: tipe backup jadi tiga pilihan, rsc | backup | keduanya, menggantikan
 * saklar backup_binary (true = 'backup', false = 'rsc').
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->string('tipe_backup', 10)->default('rsc')->after('backup_binary');
        });
        DB::table('nodes')->where('backup_binary', true)->update(['tipe_backup' => 'backup']);
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn('backup_binary');
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->boolean('backup_binary')->default(false)->after('tipe_backup');
        });
        // 'keduanya' kembali ke biner: berkas .backup-nya yang tidak bisa dibuat ulang dari .rsc.
        DB::table('nodes')->whereIn('tipe_backup', ['backup', 'keduanya'])->update(['backup_binary' => true]);
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn('tipe_backup');
        });
    }
};
