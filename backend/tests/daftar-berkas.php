<?php
/** Cek mandiri: php tests/daftar-berkas.php */
require __DIR__ . '/../app/Support/DaftarBerkas.php';

use App\Support\DaftarBerkas as D;

$gagal = 0;
$cek = function (string $nama, $dapat, $harap) use (&$gagal) {
    if ($dapat === $harap) { echo "ok   {$nama}\n"; return; }
    $gagal++;
    echo "GAGAL {$nama}\n  dapat: " . json_encode($dapat) . "\n  harap: " . json_encode($harap) . "\n";
};

$b = fn ($fn, $node, $size, $t) => ['filename' => $fn, 'node_name' => $node, 'size' => $size, 'created_at' => $t];
$files = [
    $b('backup-ccr-noc-2026-10-20-18.57WIB.backup', 'CCR-NOC', 77959, '2026-10-20T18:57:00+07:00'),
    $b('backup-ccr-noc-2026-10-20-12.50WIB.rsc', 'CCR-NOC', 16829, '2026-10-20T12:50:00+07:00'),
    $b('db-billing-2026-10-19.sql.gz', 'DB-BILLING', 48102400, '2026-10-19T02:00:00+07:00'),
    $b('backup-pop-2-2026-10-20.rsc', 'pop-2', 900, '2026-10-20T08:00:00+07:00'),
    $b('backup-pop-10-2026-10-20.rsc', 'POP-10', 800, '2026-10-20T09:00:00+07:00'),
    $b('catatan.txt', 'DB-BILLING', 10, '2026-10-18T00:00:00+07:00'),
];
$nama = fn (array $l) => array_map(fn ($f) => $f['filename'], $l);

$cek('jenis .rsc', D::jenis('a.RSC'), 'rsc');
$cek('jenis .backup', D::jenis('a.backup'), 'backup');
$cek('jenis .sql.gz', D::jenis('a.sql.gz'), 'sql');
$cek('jenis .sql', D::jenis('a.sql'), 'sql');
$cek('jenis .tar (semua database)', D::jenis('backup-bi-2026.tar'), 'sql');
$cek('jenis lain', D::jenis('a.backup.txt'), 'lain');

$cek('default terbaru dulu', $nama(D::saring($files, null, null))[0], 'backup-ccr-noc-2026-10-20-18.57WIB.backup');
$cek('terlama dulu', $nama(D::saring($files, null, null, 'terlama'))[0], 'catatan.txt');
$cek('terbesar dulu', $nama(D::saring($files, null, null, 'terbesar'))[0], 'db-billing-2026-10-19.sql.gz');
// Urutan alami & tanpa peduli huruf: pop-2 sebelum POP-10.
$cek('nama alami', array_map(fn ($f) => $f['node_name'], D::saring($files, null, null, 'nama')),
    ['CCR-NOC', 'CCR-NOC', 'DB-BILLING', 'DB-BILLING', 'pop-2', 'POP-10']);
$cek('nama: dalam node terbaru dulu', $nama(D::saring($files, null, null, 'nama'))[0], 'backup-ccr-noc-2026-10-20-18.57WIB.backup');

$cek('cari nama node, huruf kecil', count(D::saring($files, 'billing', null)), 2);
$cek('cari nama berkas', $nama(D::saring($files, '12.50', null)), ['backup-ccr-noc-2026-10-20-12.50WIB.rsc']);
$cek('cari spasi di tepi diabaikan', count(D::saring($files, '  ccr-noc ', null)), 2);
$cek('saring jenis rsc', count(D::saring($files, null, 'rsc')), 3);
$cek('saring jenis + cari', $nama(D::saring($files, 'noc', 'rsc')), ['backup-ccr-noc-2026-10-20-12.50WIB.rsc']);
$cek('tidak ada yang cocok', D::saring($files, 'tidak-ada', null), []);

$r = D::ringkas($files);
$cek('ringkas rsc', $r['rsc'], ['jumlah' => 3, 'byte' => 18529]);
$cek('ringkas sql', $r['sql'], ['jumlah' => 1, 'byte' => 48102400]);
$cek('ringkas lain', $r['lain']['jumlah'], 1);

echo $gagal ? "\n{$gagal} GAGAL\n" : "\nsemua lulus\n";
exit($gagal ? 1 : 0);
