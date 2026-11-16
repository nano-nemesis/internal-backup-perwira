<?php
/**
 * Cek mode semua database melanjutkan run yang tidak selesai (DatabaseBackupService::backupSemua).
 * mysql/mysqldump diganti skrip palsu di tests/shim; storage ke folder sementara dan DB SQLite
 * di memori, jadi aman di mana pun. Butuh vendor/ dan ±2,5 menit (jeda putaran ulang 10 detik):
 *   PATH="$PWD/tests/shim:$PATH" php tests/lanjutan-semua-db.php
 */
require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->useStoragePath($akar = sys_get_temp_dir() . '/uji-lanjutan-' . getmypid());
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'app.key' => config('app.key') ?: 'base64:' . base64_encode(random_bytes(32))]);
(require __DIR__ . '/../database/migrations/2026_09_26_000001_create_activity_logs_table.php')->up();

use App\Models\Node;
use App\Services\DatabaseBackupService;
use App\Support\BackupDibatalkan;
use App\Support\BackupSebagian;

$shim = __DIR__ . '/shim';
if (!str_starts_with((string) shell_exec('command -v mysqldump'), $shim)) {
    fwrite(STDERR, "Jalankan dengan PATH=\"$shim:\$PATH\"\n");
    exit(2);
}
$gagal = fn (string $db, bool $ya = true) => $ya ? touch("$shim/gagal-$db") : @unlink("$shim/gagal-$db");
$panggil = function () use ($shim) { $c = @file("$shim/calls", FILE_IGNORE_NEW_LINES) ?: []; @unlink("$shim/calls"); sort($c); return $c; };
$isiTar = function (string $p) { $l = array_values(array_diff(explode("\n", trim(shell_exec('tar -tf ' . escapeshellarg($p)))), ['./'])); sort($l); return $l; };
array_map('unlink', glob("$shim/gagal-*") ?: []); $panggil();

$node = new Node(['name' => 'UJI', 'type' => 'database', 'host' => '10.9.9.9', 'port' => 3306, 'db_user' => 'u', 'db_password' => 'p', 'db_name' => '*', 'schedule_interval_hours' => 3]);
$tmp = storage_path('app/backups/database/UJI/.lanjutan.tmp');
$isiTmp = fn () => is_dir($tmp) ? array_values(array_diff(scandir($tmp), ['.', '..'])) : null;
$svc = app(DatabaseBackupService::class);
$cek = [];

// 1. db_c putus terus: .tar sebagian, dump yang jadi ditinggal untuk run berikutnya.
$gagal('db_c');
try { $svc->backup($node); } catch (BackupSebagian $e) { $tar = $e->path; }
$cek['run1 db_c dicoba 6x, yang lain sekali'] = $panggil() === ['db_a', 'db_b', ...array_fill(0, 6, 'db_c'), 'db_d'];
$cek['run1 .tar sebagian'] = $isiTar($tar ?? '') === ['./db_a.sql.gz', './db_b.sql.gz', './db_d.sql.gz'];
$cek['run1 dump jadi disimpan'] = $isiTmp() === ['db_a.sql.gz', 'db_b.sql.gz', 'db_d.sql.gz'];

// 2. Sisa job mati (.part) dan database yang sudah dihapus dari server; db_c pulih.
$gagal('db_c', false);
file_put_contents("$tmp/.db_x.sql.gz.part", 'terpotong');
file_put_contents("$tmp/db_hilang.sql.gz", 'x');
$tar = $svc->backup($node);
$cek['run2 hanya db_c yang diambil'] = $panggil() === ['db_c'];
$cek['run2 .tar lengkap tanpa .part/yatim'] = $isiTar($tar) === ['./db_a.sql.gz', './db_b.sql.gz', './db_c.sql.gz', './db_d.sql.gz'];
$cek['run2 folder kerja dihapus'] = $isiTmp() === null;
$cek['run2 tercatat di Log Sistem'] = App\Models\ActivityLog::where('aksi', 'backup.lanjut')->value('konteks') === ['dilanjutkan' => 3, 'diambil' => 1];

// 3. Dump yang lebih tua dari interval jadwal diambil ulang.
$gagal('db_b');
try { $svc->backup($node); } catch (BackupSebagian) {}
$panggil();
$gagal('db_b', false);
touch("$tmp/db_a.sql.gz", time() - 4 * 3600);
$svc->backup($node);
$cek['run4 yang basi + yang gagal diambil'] = $panggil() === ['db_a', 'db_b'];

// 4. Dibatalkan: dump yang sudah jadi tetap tinggal.
$gagal('db_d');
try { $svc->backup($node); } catch (BackupSebagian) {}
$gagal('db_d', false);
try { $svc->backup($node, null, fn () => 'uji'); } catch (BackupDibatalkan) {}
$cek['batal tidak membuang dump jadi'] = $isiTmp() === ['db_a.sql.gz', 'db_b.sql.gz', 'db_c.sql.gz'];

// 5. Satu database: dump gagal tidak meninggalkan berkas, sisa .part dibersihkan.
$satu = new Node(['name' => 'SATU', 'type' => 'database', 'host' => '10.9.9.9', 'port' => 3306, 'db_user' => 'u', 'db_password' => 'p', 'db_name' => 'db_a']);
$dir = storage_path('app/backups/database/SATU');
@mkdir($dir, 0755, true);
file_put_contents("$dir/.lama.sql.gz.part", 'x');
$gagal('db_a');
try { $svc->backup($satu); } catch (RuntimeException) {}
$gagal('db_a', false);
$cek['satu DB gagal: folder bersih'] = array_diff(scandir($dir), ['.', '..']) === [];
$cek['satu DB berhasil'] = is_file($svc->backup($satu));

exec('rm -rf ' . escapeshellarg($akar));
$panggil();
foreach ($cek as $k => $ok) echo ($ok ? 'OK    ' : 'GAGAL ') . "$k\n";
exit(in_array(false, $cek, true) ? 1 : 0);
