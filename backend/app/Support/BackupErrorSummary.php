<?php

namespace App\Support;

/**
 * Menerjemahkan pesan error mentah menjadi satu kalimat sebab yang bisa
 * ditindaklanjuti.
 *
 * Error mentah dari SSH/mysqldump berguna untuk menelusuri, tapi buruk dibaca di
 * layar HP jam 2 pagi. Ringkasan ini yang ditampilkan lebih dulu; error aslinya
 * tetap disertakan di bawahnya, tidak dibuang.
 *
 * Tanpa dependensi Laravel supaya bisa diuji langsung:
 *   php tests/backup-error-summary.php
 */
class BackupErrorSummary
{
    /** [pola, sebab singkat] — dicek berurutan, yang pertama cocok dipakai. */
    private const POLA = [
        // Didahulukan: pesannya memuat "Permission denied" juga, tapi sebabnya
        // sama sekali berbeda dari penolakan autentikasi SSH.
        ['/mkdir\(\)|failed to open stream.*permission/i',
         'Folder backup tidak bisa dibuat di VPS — periksa kepemilikan storage/app/backups'],

        ['/exit code 127|command not found|not found.*sshpass|sshpass.*not found/i',
         'sshpass belum terpasang di VPS backup — pasang, atau pindah ke autentikasi SSH key'],

        ['/permission denied|publickey|authentication failed|auth fail|password ditolak/i',
         'Autentikasi SSH ditolak perangkat — periksa user, password, atau public key yang terpasang'],

        ['/connection timed out|operation timed out|timed out/i',
         'Perangkat tidak menjawab — kemungkinan mati, sibuk, atau terhalang firewall'],

        ['/connection closed by|connection reset by|kex_exchange_identification/i',
         'Router memutus koneksi SSH sebelum login — periksa /ip service ssh (address=), firewall input, atau blacklist brute-force'],

        ['/connection refused/i',
         'Koneksi ditolak — layanan SSH mati atau portnya berbeda'],

        ['/no route to host|network is unreachable|could not resolve|name or service not known/i',
         'Perangkat tidak terjangkau dari VPS backup — periksa jaringan atau alamat host'],

        ['/output \/export kosong|policy .?read/i',
         'User MikroTik belum punya policy `read`, sehingga /export tidak menghasilkan apa pun'],

        ['/tidak lengkap|-- Dump completed/i',
         'Dump terputus di tengah jalan — hasilnya tidak utuh, jadi sengaja ditolak'],

        ['/unknown database/i',
         'Nama database tidak ditemukan di server target'],

        ['/access denied for user|using password/i',
         'Kredensial MySQL ditolak — periksa user, password, dan grant-nya'],

        ['/mysqldump: not found|mysqldump.*command not found/i',
         'mysqldump belum terpasang di server target (paket mysql-client)'],

        ['/sudah basi|berumur \d+ hari/i',
         'Virtualizor berhenti membuat dump baru — periksa cron backup di node tersebut'],

        ['/tidak ada file backup ditemukan/i',
         'Direktori backup Virtualizor kosong atau pathnya salah'],

        ['/bukan sql dump yang valid/i',
         'Keluaran bukan SQL dump — biasanya kredensial atau nama database salah'],

        ['/gagal membuka proses|gagal menyimpan file|gagal membuat file/i',
         'VPS backup gagal menulis berkas — periksa ruang disk dan izin folder backup'],

    ];

    /** @return string|null null kalau tidak ada pola yang cocok. */
    public static function sebab(?string $error): ?string
    {
        $error = trim((string) $error);
        if ($error === '') {
            return null;
        }

        foreach (self::POLA as [$pola, $sebab]) {
            if (preg_match($pola, $error)) {
                return $sebab;
            }
        }

        return null;
    }
}
