<?php

namespace App\Support;

/**
 * Mode semua database: sebagian database gagal, tapi arsip berisi sisanya tetap tersimpan.
 * Run-nya gagal (supaya ada notifikasi), dan $path dicatat di log supaya berkasnya
 * tetap bisa diverifikasi dan dipakai.
 */
class BackupSebagian extends \RuntimeException
{
    public function __construct(string $pesan, public readonly string $path)
    {
        parent::__construct($pesan);
    }
}
