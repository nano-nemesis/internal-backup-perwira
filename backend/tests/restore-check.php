<?php
/** Cek mandiri: php tests/restore-check.php */
require __DIR__ . '/../app/Support/RestoreCheck.php';

use App\Support\RestoreCheck as R;

$dir = sys_get_temp_dir() . '/restore-check-' . getmypid();
mkdir($dir);
$tulis = function (string $nama, string $isi) use ($dir): string {
    file_put_contents("{$dir}/{$nama}", $isi);
    return "{$dir}/{$nama}";
};
// .backup polos: magic + panjang total (LE), lalu isi.
$biner = fn (string $isi) => pack('VV', 0xB1A1AC88, 8 + strlen($isi)) . $isi;

$ccr = ['version' => '7.23.5 (long-term)', 'model' => 'CCR1009-7G-1C-1S+'];
$rscV7 = "# 2026-10-20 18:50:25 by RouterOS 7.23.5\n# software id = X\n#\n# model = CCR1009-7G-1C-1S+\n/interface vlan\n";
$rscV6 = "# jun/11/2026 12:49:33 by RouterOS 6.49.13\n# software id = X\n#\n# model = CCR1009-7G-1C-1S+\n/interface vlan\n";

// [nama berkas, isi, perangkat sekarang, catatan saat backup, putusan, status per cek: integritas/model/versi]
$kasus = [
    ['utuh.backup', $biner(str_repeat('x', 100)), $ccr, $ccr, 'siap', ['ok', 'ok', 'ok']],
    ['terpotong.backup', substr($biner(str_repeat('x', 100)), 0, 50), $ccr, $ccr, 'tidak-bisa', ['gagal', 'ok', 'ok']],
    ['enkrip.backup', pack('VV', 0x7391A8EF, 0) . 'zz', $ccr, $ccr, 'perhatian', ['peringatan', 'ok', 'ok']],
    ['sampah.backup', 'bukan backup sama sekali', $ccr, $ccr, 'tidak-bisa', ['gagal', 'ok', 'ok']],
    ['model-lain.backup', $biner('x'), ['version' => '7.23.5', 'model' => 'CCR2116-12G-4S+'], $ccr, 'tidak-bisa', ['ok', 'gagal', 'ok']],
    ['router-lebih-lama.backup', $biner('x'), ['version' => '7.20 (stable)', 'model' => 'CCR1009-7G-1C-1S+'], $ccr, 'tidak-bisa', ['ok', 'ok', 'gagal']],
    ['router-lebih-baru.backup', $biner('x'), ['version' => '7.24', 'model' => 'CCR1009-7G-1C-1S+'], $ccr, 'perhatian', ['ok', 'ok', 'peringatan']],
    ['lama-tanpa-catatan.backup', $biner('x'), $ccr, ['version' => null, 'model' => null], 'perhatian', ['ok', 'peringatan', 'peringatan']],
    ['belum-dicek.backup', $biner('x'), ['version' => null, 'model' => null], $ccr, 'perhatian', ['ok', 'peringatan', 'peringatan']],
    // .rsc: versi & model dibaca dari header berkas, catatan log diabaikan.
    ['sama.rsc', $rscV7, $ccr, ['version' => null, 'model' => null], 'siap', ['ok', 'ok', 'ok']],
    ['v6-ke-v7.rsc', $rscV6, $ccr, ['version' => null, 'model' => null], 'perhatian', ['ok', 'ok', 'peringatan']],
    ['model-lain.rsc', $rscV7, ['version' => '7.23.5', 'model' => 'RB5009UG+S+'], $ccr, 'perhatian', ['ok', 'peringatan', 'ok']],
    ['minor-lebih-lama.rsc', $rscV7, ['version' => '7.25', 'model' => 'CCR1009-7G-1C-1S+'], $ccr, 'siap', ['ok', 'ok', 'ok']],
    ['tanpa-header.rsc', "/interface vlan\n", $ccr, $ccr, 'perhatian', ['peringatan', 'ok', 'ok']],
];

$gagal = [];
foreach ($kasus as [$nama, $isi, $sekarang, $saatBackup, $putusan, $status]) {
    $h = R::periksa($tulis($nama, $isi), $sekarang, $saatBackup);
    $dapat = array_column($h['cek'], 'status');
    if ($h['putusan'] !== $putusan || $dapat !== $status) {
        $gagal[] = "{$nama}: harap {$putusan} [" . implode(',', $status) . "], dapat {$h['putusan']} [" . implode(',', $dapat) . ']';
    }
    if (!$h['langkah'] || !str_contains(implode("\n", $h['langkah']), $nama)) {
        $gagal[] = "{$nama}: langkah restore tidak menyebut nama berkas";
    }
}
array_map('unlink', glob("{$dir}/*"));
rmdir($dir);

if ($gagal) { fwrite(STDERR, implode("\n", $gagal) . "\n"); exit(1); }
echo 'OK: ' . count($kasus) . " skenario restore dinilai benar\n";
