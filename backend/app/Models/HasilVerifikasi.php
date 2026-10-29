<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Hasil verifikasi satu berkas backup: cek struktur (otomatis) dan restore uji (tombol). */
class HasilVerifikasi extends Model
{
    protected $table = 'hasil_verifikasi';

    protected $fillable = ['file_path', 'struktur', 'restore'];

    protected $casts = [
        'struktur' => 'array',
        'restore' => 'array',
    ];

    public static function simpan(string $path, string $kolom, array $hasil): void
    {
        static::updateOrCreate(['file_path' => $path], [$kolom => $hasil]);
    }
}
