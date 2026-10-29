<?php

namespace App\Support;

/**
 * Backup dihentikan pengguna (tombol Batalkan). Sengaja BUKAN RuntimeException:
 * jalur dump menangkap RuntimeException per database sebagai "gagal, coba ulang",
 * sedangkan pembatalan harus menembus semuanya sampai BackupService.
 */
class BackupDibatalkan extends \Exception
{
    public function __construct(public readonly string $oleh)
    {
        parent::__construct("Dibatalkan oleh {$oleh}.");
    }

    /** Kunci cache tanda batal untuk satu log backup; dibaca worker, ditulis tombol Batalkan. */
    public static function kunci(string $logId): string
    {
        return "backup-batal:{$logId}";
    }
}
