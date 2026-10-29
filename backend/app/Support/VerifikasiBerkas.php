<?php

namespace App\Support;

use Symfony\Component\Process\Process;

/**
 * Verifikasi struktur berkas backup tanpa mengimpor apa pun: apakah berkasnya utuh dan
 * lengkap untuk di-restore. Dijalankan otomatis setelah setiap backup berhasil, dan hasil
 * 'gagal' membuat backup itu gagal. Restore uji sungguhan ada di UjiRestoreService.
 * Tes: php tests/verifikasi-berkas.php
 */
final class VerifikasiBerkas
{
    /**
     * Baris penanda dump mysqldump/mariadb-dump. grep -o hanya mengeluarkan potongan
     * yang cocok, jadi baris INSERT ber-MB tidak pernah masuk ke PHP.
     */
    private const POLA = '^(-- (MySQL|MariaDB) dump|/\*M!999999|-- Server version.*|-- Table structure for table `[^`]*`'
        . '|-- Final view structure for view `[^`]*`|INSERT INTO `[^`]*`'
        . '|/\*!50003 CREATE\*/ /\*!50017 DEFINER=[^*]*\*/ /\*!50003 TRIGGER [^ ]+|-- Dump completed)';

    /** Ukuran export MikroTik turun lebih dari ini dibanding backup sebelumnya = mencurigakan. */
    private const SUSUT_MAKS = 0.5;

    /**
     * @param bool $dumpKita false = dump buatan pihak lain (Virtualizor): formatnya tidak
     *        dijamin, jadi header/penanda yang hilang cukup peringatan.
     * @param ?int $ukuranSebelumnya ukuran backup berhasil sebelumnya dari node yang sama (MikroTik)
     * @return array{status: string, ringkasan: string, cek: array, pada: string}
     */
    public static function periksa(string $path, bool $dumpKita = true, ?int $ukuranSebelumnya = null): array
    {
        [$cek, $ringkasan] = match (true) {
            str_ends_with($path, '.tar') => self::tar($path),
            str_ends_with($path, '.sql.gz') => self::sqlGz($path, $dumpKita),
            str_ends_with($path, '.rsc'), str_ends_with($path, '.backup') => self::mikrotik($path, $ukuranSebelumnya),
            default => [[self::item('peringatan', 'Jenis berkas', 'Jenis berkas tidak dikenali, isinya tidak diperiksa.')], 'tidak dikenali'],
        };

        return ['status' => self::terburuk($cek), 'ringkasan' => $ringkasan, 'cek' => $cek, 'pada' => now()->toIso8601String()];
    }

    /**
     * Pindai satu dump (dibaca dari perintah $sumber, mis. gzip -dc) dalam satu lintasan.
     * @param string[] $sumber perintah yang menulis SQL polos ke stdout
     * @return array{utuh: bool, galat: string, header: bool, selesai: bool, server: ?string, tabel: string[], view: string[], trigger: string[], berisi: string[]}
     */
    public static function pindai(array $sumber): array
    {
        // pipefail lewat PIPESTATUS: gzip yang rusak (CRC, terpotong) harus terbaca walau
        // grep sukses, dan grep tanpa kecocokan (exit 1) bukan kegagalan.
        $p = new Process(['bash', '-c', 'pola=$1; shift; "$@" | LC_ALL=C grep -a -n -o -E -- "$pola"; s=("${PIPESTATUS[@]}");'
            . ' [ "${s[0]}" -eq 0 ] || exit 90; [ "${s[1]}" -le 1 ] || exit 91', '_', self::POLA, ...$sumber], null, null, null, 3600);
        $p->run();

        $hasil = ['utuh' => $p->getExitCode() === 0, 'galat' => trim(substr($p->getErrorOutput(), 0, 500)),
            'header' => false, 'selesai' => false, 'server' => null, 'tabel' => [], 'view' => [], 'trigger' => [], 'berisi' => []];
        $nama = fn (string $s) => trim(substr($s, strrpos($s, ' ') + 1), '`');
        $sandbox = false;

        foreach (explode("\n", $p->getOutput()) as $baris) {
            [$no, $isi] = array_pad(explode(':', $baris, 2), 2, '');
            if ($isi === '') {
                continue;
            }
            match (true) {
                str_starts_with($isi, '/*M!999999') => $sandbox = (int) $no === 1,
                str_starts_with($isi, '-- MySQL dump'), str_starts_with($isi, '-- MariaDB dump')
                    => $hasil['header'] = $hasil['header'] || (int) $no === 1 || ($sandbox && (int) $no === 2),
                str_starts_with($isi, '-- Server version') => $hasil['server'] ??= trim(substr($isi, 17)),
                str_starts_with($isi, '-- Table structure') => $hasil['tabel'][] = $nama($isi),
                str_starts_with($isi, '-- Final view') => $hasil['view'][] = $nama($isi),
                str_starts_with($isi, 'INSERT INTO') => $hasil['berisi'][$nama($isi)] = true,
                str_starts_with($isi, '/*!50003 CREATE') => $hasil['trigger'][] = $nama($isi),
                str_starts_with($isi, '-- Dump completed') => $hasil['selesai'] = true,
                default => null,
            };
        }
        $hasil['berisi'] = array_keys($hasil['berisi']);
        // Nama trigger bisa ditulis bersama skemanya (db.tr): yang dibandingkan namanya saja.
        $hasil['trigger'] = array_map(fn ($t) => str_contains($t, '.') ? substr($t, strrpos($t, '.') + 1) : $t, $hasil['trigger']);

        return $hasil;
    }

    /** @return array{0: array, 1: string} */
    private static function sqlGz(string $path, bool $dumpKita): array
    {
        $d = self::pindai(['gzip', '-dc', '--', $path]);
        return [self::cekDump($d, $dumpKita), self::isiDump($d)];
    }

    private static function cekDump(array $d, bool $dumpKita): array
    {
        $tegas = $dumpKita ? 'gagal' : 'peringatan';
        $cek = [
            $d['utuh']
                ? self::item('ok', 'Kompresi utuh', 'Seluruh berkas terbaca sampai akhir tanpa galat gzip (CRC cocok).')
                : self::item('gagal', 'Kompresi utuh', 'Berkas gzip rusak atau terpotong, isinya tidak bisa dibaca sampai akhir. ' . $d['galat']),
            $d['header']
                ? self::item('ok', 'Header dump', 'Diawali header mysqldump, tidak ada teks lain di depannya.')
                : self::item($tegas, 'Header dump', 'Baris pertama bukan header mysqldump (mungkin teks lain ikut tertulis); restore bisa gagal di baris 1.'),
            $d['selesai']
                ? self::item('ok', 'Dump lengkap', 'Penanda "-- Dump completed" ada: mysqldump selesai sampai akhir.')
                : self::item($tegas, 'Dump lengkap', 'Penanda "-- Dump completed" tidak ada: dump kemungkinan terputus di tengah.'),
        ];
        $cek[] = $d['tabel'] || $d['view']
            ? self::item('ok', 'Isi', self::isiDump($d) . '.')
            : self::item('peringatan', 'Isi', 'Dump tidak berisi satu tabel pun. Wajar kalau database-nya memang kosong.');

        return $cek;
    }

    private static function isiDump(array $d): string
    {
        return count($d['tabel']) . ' tabel (' . count($d['berisi']) . ' berisi data), '
            . count($d['view']) . ' view, ' . count($d['trigger']) . ' trigger';
    }

    /** @return array{0: array, 1: string} */
    private static function tar(string $path): array
    {
        $daftar = new Process(['tar', '-tf', $path], null, null, null, 600);
        $daftar->run();
        if (!$daftar->isSuccessful()) {
            return [[self::item('gagal', 'Arsip .tar', 'Arsip tidak bisa dibaca: ' . trim($daftar->getErrorOutput()))], 'arsip rusak'];
        }
        $anggota = array_values(array_filter(array_map('trim', explode("\n", $daftar->getOutput())),
            fn ($a) => str_ends_with($a, '.sql.gz')));
        if (!$anggota) {
            return [[self::item('gagal', 'Arsip .tar', 'Arsip tidak berisi satu pun dump .sql.gz.')], 'arsip kosong'];
        }

        // Dibongkar sekali ke folder sementara: tar -xOf per anggota membaca ulang arsip
        // dari awal, untuk 371 database itu ratusan GB baca.
        $tmp = dirname($path) . '/.verifikasi-' . bin2hex(random_bytes(4));
        mkdir($tmp, 0700);
        try {
            (new Process(['tar', '-xf', $path, '-C', $tmp], null, null, null, 3600))->mustRun();
            $rusak = [];
            $tabel = $view = $trigger = 0;
            foreach ($anggota as $a) {
                $d = self::pindai(['gzip', '-dc', '--', "{$tmp}/{$a}"]);
                $gagal = array_filter(self::cekDump($d, true), fn ($c) => $c['status'] === 'gagal');
                if ($gagal) {
                    $rusak[] = basename($a, '.sql.gz') . ': ' . implode('; ', array_column($gagal, 'judul'));
                }
                $tabel += count($d['tabel']);
                $view += count($d['view']);
                $trigger += count($d['trigger']);
            }
        } finally {
            (new Process(['rm', '-rf', '--', $tmp]))->run();
        }

        $n = count($anggota);
        $ringkasan = "{$n} database, {$tabel} tabel, {$view} view, {$trigger} trigger";
        $cek = [
            self::item('ok', 'Arsip .tar', "Arsip terbaca utuh, berisi {$n} dump database."),
            $rusak
                ? self::item('gagal', 'Dump per database', count($rusak) . " dari {$n} dump bermasalah: "
                    . implode(' | ', array_slice($rusak, 0, 5)) . (count($rusak) > 5 ? ' | dan ' . (count($rusak) - 5) . ' lainnya' : ''))
                : self::item('ok', 'Dump per database', "Ke-{$n} dump utuh: kompresi, header, dan penanda selesai semuanya lolos."),
            self::item('ok', 'Isi', "{$ringkasan}."),
        ];

        return [$cek, $ringkasan];
    }

    /** @return array{0: array, 1: string} */
    private static function mikrotik(string $path, ?int $ukuranSebelumnya): array
    {
        $ukuran = (int) filesize($path);
        $cek = [RestoreCheck::integritas($path)];

        if (str_ends_with($path, '.rsc')) {
            $ekor = (string) file_get_contents($path, false, null, max(0, $ukuran - 1));
            $cek[] = $ekor === "\n"
                ? self::item('ok', 'Akhir berkas', 'Baris terakhir lengkap: export tidak terpotong di tengah baris.')
                : self::item('gagal', 'Akhir berkas', 'Berkas tidak diakhiri baris baru: export kemungkinan terpotong.');
        }

        if ($ukuranSebelumnya > 0) {
            $susut = 1 - $ukuran / $ukuranSebelumnya;
            $cek[] = $susut > self::SUSUT_MAKS
                ? self::item('peringatan', 'Ukuran dibanding sebelumnya', sprintf(
                    'Turun %d%% dari backup sebelumnya (%s → %s byte). Bisa jadi konfigurasi memang dihapus, '
                    . 'tapi juga bisa export yang tidak lengkap; cek isinya.', round($susut * 100), $ukuranSebelumnya, $ukuran))
                : self::item('ok', 'Ukuran dibanding sebelumnya', sprintf('%s byte, sebelumnya %s byte.', $ukuran, $ukuranSebelumnya));
        }

        return [$cek, (str_ends_with($path, '.rsc') ? 'export .rsc' : 'backup biner') . ", {$ukuran} byte"];
    }

    public static function terburuk(array $cek): string
    {
        $status = array_column($cek, 'status');
        return in_array('gagal', $status, true) ? 'gagal' : (in_array('peringatan', $status, true) ? 'peringatan' : 'ok');
    }

    private static function item(string $status, string $judul, string $detail): array
    {
        return compact('status', 'judul', 'detail');
    }
}
