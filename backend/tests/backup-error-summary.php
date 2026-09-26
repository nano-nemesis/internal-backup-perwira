<?php
/** Cek mandiri: php tests/backup-error-summary.php */
require __DIR__ . '/../app/Support/BackupErrorSummary.php';

use App\Support\BackupErrorSummary as S;

// Pesan error NYATA yang diproduksi kode ini + galat SSH/MySQL yang lazim.
$kasus = [
    ['SSH command gagal ke 10.0.0.9 (exit code 127): sh: 1: sshpass: not found', 'sshpass'],
    ['SSH command gagal ke 10.10.3.1 (exit code 255): Permission denied (publickey,password).', 'Autentikasi SSH'],
    ['ssh: connect to host 10.0.0.4 port 22: Connection timed out', 'tidak menjawab'],
    ['ssh: connect to host 10.0.0.5 port 22: Connection refused', 'ditolak'],
    ['SSH command gagal ke 45.32.114.199 (exit code 255): Connection closed by 45.32.114.199 port 22', 'memutus koneksi'],
    ['SSH command gagal ke 10.0.0.7 (exit code 5): password ditolak (sshpass exit 5)', 'Autentikasi SSH'],
    ['ssh: Could not resolve hostname rb-x: Name or service not known', 'tidak terjangkau'],
    ["Output /export kosong dari 10.10.0.1. Pastikan user SSH memiliki policy 'read' di MikroTik.", 'policy'],
    ["Dump dari 10.0.0.9 tidak lengkap — penanda '-- Dump completed' tidak ditemukan.", 'terputus'],
    ["mysqldump: Got error: 1049: Unknown database 'billingx'", 'tidak ditemukan'],
    ["mysqldump: Got error: 1045: Access denied for user 'backup'@'localhost' (using password: YES)", 'Kredensial MySQL'],
    ['Backup terbaru di 10.10.9.5 sudah basi: [20260801.sql.gz] berumur 28 hari.', 'Virtualizor'],
    ['Tidak ada file backup ditemukan di 10.10.9.5:/var/virtualizor/backup/db.', 'kosong atau pathnya salah'],
    ['mkdir(): Permission denied', 'Folder backup'],
];

$gagal = [];
foreach ($kasus as [$err, $harusMuat]) {
    $s = S::sebab($err);
    if ($s === null) { $gagal[] = "TIDAK DIKENALI: " . substr($err, 0, 60); continue; }
    if (stripos($s, $harusMuat) === false) {
        $gagal[] = "SALAH KATEGORI untuk \"" . substr($err, 0, 45) . "\" -> {$s}";
    }
}
// Error asing harus mengembalikan null, bukan menebak.
foreach (['', '   ', 'sesuatu yang sama sekali baru dan tak dikenal'] as $x) {
    if (S::sebab($x) !== null) $gagal[] = "seharusnya null untuk: " . var_export($x, true);
}

if ($gagal) { fwrite(STDERR, implode("\n", $gagal) . "\n"); exit(1); }
printf("OK — %d pesan error dikenali, dan error asing tetap null\n", count($kasus));
