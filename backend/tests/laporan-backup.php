<?php
/** Cek mandiri: php tests/laporan-backup.php */
require __DIR__ . '/../app/Support/BackupErrorSummary.php';
require __DIR__ . '/../app/Support/LaporanBackup.php';

use App\Support\LaporanBackup;

$t = fn (string $jam) => "2026-11-10T{$jam}:00+07:00";
$node = fn (string $id, bool $aktif = true) => ['id' => $id, 'nama' => strtoupper($id), 'tipe' => 'mikrotik', 'host' => '10.0.0.1', 'aktif' => $aktif, 'backup_terakhir' => null];
$gagal = fn (string $id, string $jam, string $error, string $aksi = 'backup.gagal') =>
    ['node_id' => $id, 'node_name' => strtoupper($id), 'aksi' => $aksi, 'error' => $error, 'sebab' => null, 'waktu' => $t($jam)];

$r = LaporanBackup::rangkum(
    [$node('lancar'), $node('kadang'), $node('mati'), $node('sepi'), $node('cuti', false), $node('simulasi')],
    [
        'lancar' => ['n' => 8, 'terakhir' => $t('21:00'), 'nama' => 'LANCAR'],
        'kadang' => ['n' => 2, 'terakhir' => $t('09:00'), 'nama' => 'KADANG'],
        'hapus'  => ['n' => 1, 'terakhir' => $t('01:00'), 'nama' => 'DIHAPUS'],
    ],
    [
        $gagal('kadang', '12:00', 'ssh: connect to host 10.0.0.4 port 22: Connection timed out'),
        $gagal('mati', '03:00', "mysqldump: Got error: 1045: Access denied for user 'x'@'y' (using password: YES)"),
        $gagal('mati', '06:00', "mysqldump: Got error: 1045: Access denied for user 'x'@'y' (using password: YES)"),
        $gagal('mati', '09:00', 'job mati', 'backup.crash'),
        $gagal('simulasi', '10:00', '[SIMULASI] ssh: connect to host 192.0.2.1 port 22: Connection timed out'),
        $gagal('kadang', '13:00', 'sesuatu yang sama sekali baru'),
    ],
);

$per = array_column($r['perangkat'], null, 'id');
$cek = [
    'lancar berhasil semua'          => $per['lancar']['status'] === 'berhasil',
    'kadang = sebagian'              => $per['kadang']['status'] === 'sebagian' && $per['kadang']['gagal'] === 2,
    'kadang terakhir gagal 13:00'    => $per['kadang']['terakhir'] === ['status' => 'gagal', 'waktu' => $t('13:00')],
    'mati = gagal semua, 3x'         => $per['mati']['status'] === 'gagal' && $per['mati']['gagal'] === 3,
    'mati sebab terbanyak di atas'   => str_contains($per['mati']['sebab'][0]['sebab'], 'Kredensial MySQL') && $per['mati']['sebab'][0]['jumlah'] === 2,
    'crash punya sebab sendiri'      => $per['mati']['sebab'][1]['sebab'] === LaporanBackup::SEBAB_CRASH,
    'error asing tetap tercatat'     => in_array(LaporanBackup::SEBAB_ASING, array_column($per['kadang']['sebab'], 'sebab'), true),
    'sepi aktif = tanpa backup'      => $per['sepi']['status'] === 'tanpa' && $per['sepi']['terakhir'] === null,
    'nonaktif tanpa catatan dilewati'=> !isset($per['cuti']) && $r['ringkasan']['nonaktif'] === 1,
    'simulasi tidak dihitung gagal'  => $per['simulasi']['status'] === 'tanpa',
    'node terhapus tetap muncul'     => $per['hapus']['nama'] === 'DIHAPUS' && $per['hapus']['terdaftar'] === false,
    'urutan: gagal dulu'             => $r['perangkat'][0]['id'] === 'mati' && $r['perangkat'][1]['id'] === 'kadang',
    'ringkasan'                      => $r['ringkasan'] === ['perangkat' => 6, 'berhasil' => 2, 'sebagian' => 1, 'gagal' => 1,
        'tanpa' => 2, 'nonaktif' => 1, 'run_berhasil' => 11, 'run_gagal' => 5],
    'sebab global + perangkat'       => $r['sebab'][0]['jumlah'] === 2 && $r['sebab'][0]['perangkat'] === ['MATI'],
];

$salah = array_keys(array_filter($cek, fn ($ok) => !$ok));
if ($salah) { fwrite(STDERR, "GAGAL: " . implode(', ', $salah) . "\n" . json_encode($r, JSON_PRETTY_PRINT) . "\n"); exit(1); }
printf("OK: %d cek laporan backup\n", count($cek));
