<?php

namespace App\Support;

/**
 * Penyaringan, pengurutan, dan ringkasan daftar berkas backup (menu Berkas Backup).
 * Fungsi murni atas array berkas, supaya bisa diuji tanpa disk: tests/daftar-berkas.php.
 */
class DaftarBerkas
{
    public const URUT = ['terbaru', 'terlama', 'nama', 'terbesar'];

    /** rsc | backup | sql | lain, dari akhiran nama berkas. */
    public static function jenis(string $filename): string
    {
        $f = strtolower($filename);
        return match (true) {
            str_ends_with($f, '.rsc') => 'rsc',
            str_ends_with($f, '.backup') => 'backup',
            str_ends_with($f, '.sql.gz'), str_ends_with($f, '.sql') => 'sql',
            default => 'lain',
        };
    }

    /**
     * @param array<int, array{filename: string, node_name: string, size: int, created_at: string}> $files
     * $q dicocokkan ke nama berkas ATAU nama node, tanpa peduli huruf besar-kecil.
     */
    public static function saring(array $files, ?string $q, ?string $jenis, string $urut = 'terbaru'): array
    {
        $q = mb_strtolower(trim((string) $q));

        $hasil = array_values(array_filter($files, fn (array $f) =>
            ($jenis === null || $jenis === '' || self::jenis($f['filename']) === $jenis)
            && ($q === '' || str_contains(mb_strtolower($f['filename']), $q) || str_contains(mb_strtolower($f['node_name']), $q))
        ));

        usort($hasil, match ($urut) {
            'terlama' => fn ($a, $b) => strcmp($a['created_at'], $b['created_at']),
            'nama' => fn ($a, $b) => strnatcasecmp($a['node_name'], $b['node_name']) ?: strcmp($b['created_at'], $a['created_at']),
            'terbesar' => fn ($a, $b) => $b['size'] <=> $a['size'],
            default => fn ($a, $b) => strcmp($b['created_at'], $a['created_at']),
        });

        return $hasil;
    }

    /** Jumlah berkas dan total byte per jenis. */
    public static function ringkas(array $files): array
    {
        $r = array_fill_keys(['rsc', 'backup', 'sql', 'lain'], ['jumlah' => 0, 'byte' => 0]);
        foreach ($files as $f) {
            $j = self::jenis($f['filename']);
            $r[$j]['jumlah']++;
            $r[$j]['byte'] += $f['size'];
        }
        return $r;
    }
}
