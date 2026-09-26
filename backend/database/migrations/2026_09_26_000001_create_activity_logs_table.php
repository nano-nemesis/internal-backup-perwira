<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Log aktivitas & kejadian sistem: login, backup, perubahan node/user, error.
 *
 * user_id/node_id sengaja TANPA foreign key, dan nama keduanya ikut disalin:
 * jejak audit harus tetap terbaca setelah user atau node-nya dihapus.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->string('level', 10);          // info | warning | error
            $table->string('kategori', 20);       // auth | backup | node | user | terminal | berkas | pengaturan | sistem
            $table->string('aksi', 50);           // mis. login.gagal, backup.berhasil
            $table->text('pesan');
            $table->json('konteks')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('username', 100)->nullable();
            $table->string('ip', 45)->nullable();
            $table->uuid('node_id')->nullable();
            $table->string('node_name', 100)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();

            $table->index(['kategori', 'created_at']);
            $table->index(['level', 'created_at']);
            $table->index('node_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};
