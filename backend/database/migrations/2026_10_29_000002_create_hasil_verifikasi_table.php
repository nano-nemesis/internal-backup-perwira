<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hasil verifikasi per BERKAS, bukan per log: ada berkas backup tanpa baris backup_logs
 * (impor lama, .tar yang tersimpan sebagian), dan berkas itu tetap harus bisa diverifikasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hasil_verifikasi', function (Blueprint $table) {
            $table->id();
            // Path absolut berkas; dihapus bersama berkasnya oleh retensi.
            $table->string('file_path', 700)->unique();
            $table->json('struktur')->nullable();
            $table->json('restore')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hasil_verifikasi');
    }
};
