<?php
/** Cek mandiri: php tests/verifikasi-berkas.php (butuh vendor/ terpasang, gzip dan tar di PATH). */
require __DIR__ . '/../vendor/autoload.php';
if (!function_exists('now')) { function now() { return \Carbon\Carbon::now(); } }
require_once __DIR__ . '/../app/Support/RestoreCheck.php';
require_once __DIR__ . '/../app/Support/VerifikasiBerkas.php';
require_once __DIR__ . '/../app/Services/DatabaseBackupService.php';

use App\Services\DatabaseBackupService;
use App\Support\VerifikasiBerkas as V;

$gagal = 0;
$cek = function (string $nama, $dapat, $harap) use (&$gagal) {
    if ($dapat === $harap) { echo "ok   {$nama}\n"; return; }
    $gagal++;
    echo "GAGAL {$nama}\n  dapat: " . json_encode($dapat) . "\n  harap: " . json_encode($harap) . "\n";
};
$dir = sys_get_temp_dir() . '/uji-verifikasi-' . getmypid();
mkdir($dir);
$gz = function (string $nama, string $isi) use ($dir) { $p = "{$dir}/{$nama}"; file_put_contents($p, gzencode($isi)); return $p; };
$status = fn (array $h, string $judul) => array_column($h['cek'], 'status', 'judul')[$judul] ?? null;

$dump = "-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)\n--\n-- Host: x    Database: billing\n"
    . "--\n-- Table structure for table `pelanggan`\n--\nCREATE TABLE `pelanggan` (`id` int);\n"
    . "INSERT INTO `pelanggan` VALUES (1),(2);\n--\n-- Table structure for table `log`\n--\nCREATE TABLE `log` (`id` int);\n"
    . "/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `tr_catat` AFTER INSERT ON `pelanggan` FOR EACH ROW INSERT INTO log VALUES (NEW.id) */;;\n"
    . "--\n-- Final view structure for view `v_nama`\n--\n/*!50001 VIEW `v_nama` AS select 1 */;\n"
    . "-- Dump completed on 2026-10-29 10:00:00\n";

// Dump utuh: semua lolos, isi terbaca dari penanda.
$h = V::periksa($gz('baik.sql.gz', $dump));
$cek('dump utuh: status ok', $h['status'], 'ok');
$cek('dump utuh: ringkasan isi', $h['ringkasan'], '2 tabel (1 berisi data), 1 view, 1 trigger');
$d = V::pindai(['gzip', '-dc', '--', "{$dir}/baik.sql.gz"]);
$cek('pindai: nama tabel', $d['tabel'], ['pelanggan', 'log']);
$cek('pindai: tabel berisi', $d['berisi'], ['pelanggan']);
$cek('pindai: trigger', $d['trigger'], ['tr_catat']);
$cek('pindai: view', $d['view'], ['v_nama']);

// Header sandbox mariadb-dump baru (baris 1) lalu header di baris 2: tetap sah.
$h = V::periksa($gz('sandbox.sql.gz', "/*M!999999\\- enable the sandbox mode */ \n-- MariaDB dump 10.19\n" . substr($dump, strpos($dump, "\n") + 1)));
$cek('header sandbox MariaDB: ok', $status($h, 'Header dump'), 'ok');

// MOTD di depan dump (bug lama mode SSH): restore gagal di baris 1.
$h = V::periksa($gz('motd.sql.gz', "Welcome to Ubuntu 24.04 LTS\n\n" . $dump));
$cek('MOTD di depan: header gagal', $status($h, 'Header dump'), 'gagal');
$cek('MOTD di depan: status gagal', $h['status'], 'gagal');

// Penanda selesai hilang: dump terpotong. Dump buatan pihak lain cukup peringatan.
$terpotong = substr($dump, 0, strpos($dump, '-- Dump completed'));
$cek('tanpa penanda selesai: gagal', V::periksa($gz('potong.sql.gz', $terpotong))['status'], 'gagal');
$cek('tanpa penanda, dump Virtualizor: peringatan', V::periksa("{$dir}/potong.sql.gz", false)['status'], 'peringatan');

// gzip rusak (terpotong di tengah): CRC tidak bisa dicek sampai akhir.
$utuh = gzencode(str_repeat($dump, 2000));
file_put_contents("{$dir}/rusak.sql.gz", substr($utuh, 0, (int) (strlen($utuh) / 2)));
$h = V::periksa("{$dir}/rusak.sql.gz");
$cek('gzip terpotong: kompresi gagal', $status($h, 'Kompresi utuh'), 'gagal');

// Dump kosong (database tanpa tabel): peringatan, bukan gagal.
$cek('dump tanpa tabel: peringatan', V::periksa($gz('kosong.sql.gz', "-- MySQL dump 10.13\n-- Dump completed on x\n"))['status'], 'peringatan');

// .tar mode semua database: utuh, lalu satu anggota rusak.
mkdir("{$dir}/tar");
file_put_contents("{$dir}/tar/a.sql.gz", gzencode($dump));
file_put_contents("{$dir}/tar/b.sql.gz", gzencode($dump));
exec('tar -cf ' . escapeshellarg("{$dir}/semua.tar") . ' -C ' . escapeshellarg("{$dir}/tar") . ' .');
$h = V::periksa("{$dir}/semua.tar");
$cek('tar utuh: ok', $h['status'], 'ok');
$cek('tar utuh: ringkasan', $h['ringkasan'], '2 database, 4 tabel, 2 view, 2 trigger');
file_put_contents("{$dir}/tar/b.sql.gz", gzencode($terpotong));
exec('tar -cf ' . escapeshellarg("{$dir}/semua2.tar") . ' -C ' . escapeshellarg("{$dir}/tar") . ' .');
$h = V::periksa("{$dir}/semua2.tar");
$cek('tar dengan satu dump terpotong: gagal', $status($h, 'Dump per database'), 'gagal');
$cek('folder bongkar dibersihkan', glob("{$dir}/.verifikasi-*"), []);
file_put_contents("{$dir}/bukan.tar", 'bukan arsip');
$cek('bukan arsip: gagal', V::periksa("{$dir}/bukan.tar")['status'], 'gagal');

// MikroTik .rsc: utuh, terpotong di tengah baris, dan menyusut drastis.
$rsc = "# 2026-10-29 10:00:00 by RouterOS 7.23.5\n# model = CCR1009-7G-1C-1S+\n/system identity\nset name=CORE\n";
file_put_contents("{$dir}/a.rsc", $rsc);
$cek('rsc utuh: ok', V::periksa("{$dir}/a.rsc", true, strlen($rsc))['status'], 'ok');
file_put_contents("{$dir}/b.rsc", rtrim($rsc, "\n"));
$cek('rsc tanpa baris baru di akhir: gagal', $status(V::periksa("{$dir}/b.rsc"), 'Akhir berkas'), 'gagal');
$cek('rsc menyusut >50%: peringatan', $status(V::periksa("{$dir}/a.rsc", true, strlen($rsc) * 3), 'Ukuran dibanding sebelumnya'), 'peringatan');

// MikroTik .backup: magic + panjang tercatat = ukuran berkas.
file_put_contents("{$dir}/a.backup", pack('VV', 0xB1A1AC88, 16) . str_repeat("\0", 8));
$cek('.backup utuh: ok', V::periksa("{$dir}/a.backup")['status'], 'ok');
file_put_contents("{$dir}/b.backup", pack('VV', 0xB1A1AC88, 999) . str_repeat("\0", 8));
$cek('.backup panjang tak cocok: gagal', V::periksa("{$dir}/b.backup")['status'], 'gagal');

// Penilaian SHOW GRANTS untuk uji backup.
$g = fn (string $grants, ?string $db) => DatabaseBackupService::nilaiGrant($grants, $db)[0];
$cek('grant lengkap per database', $g("GRANT USAGE ON *.* TO `u`@`%`\nGRANT SELECT, SHOW VIEW, TRIGGER ON `canvasperwira`.* TO `u`@`%`", 'canvasperwira'), 'ok');
$cek('grant ALL PRIVILEGES', $g('GRANT ALL PRIVILEGES ON *.* TO `root`@`localhost`', 'x'), 'ok');
$cek('tanpa TRIGGER: peringatan', $g('GRANT SELECT, SHOW VIEW ON `db`.* TO `u`@`%`', 'db'), 'peringatan');
$cek('tanpa SELECT: gagal', $g('GRANT USAGE ON *.* TO `u`@`%`', 'db'), 'gagal');
$cek('mode semua, grant cuma satu database: gagal', $g('GRANT SELECT, SHOW VIEW, TRIGGER ON `db`.* TO `u`@`%`', null), 'gagal');
$cek('mode semua, grant ON *.*: ok', $g('GRANT SELECT, SHOW DATABASES, SUPER, SHOW VIEW, TRIGGER ON *.* TO `db_backup`@`%` WITH GRANT OPTION', null), 'ok');
$cek('nama database ber-underscore di grant (escape \\_)', $g('GRANT SELECT, SHOW VIEW, TRIGGER ON `my\_db`.* TO `u`@`%`', 'my_db'), 'ok');

exec('rm -rf ' . escapeshellarg($dir));
echo $gagal ? "\n{$gagal} GAGAL\n" : "\nsemua lulus\n";
exit($gagal ? 1 : 0);
