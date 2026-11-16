<?php

namespace App\Support;

/**
 * Rekap hasil backup dalam satu rentang waktu: per perangkat berapa kali berhasil dan
 * gagal, dan sebab gagalnya dikelompokkan.
 *
 * Tanpa dependensi Laravel supaya bisa diuji langsung:
 *   php tests/laporan-backup.php
 */
class LaporanBackup
{
    public const SEBAB_CRASH = 'Job backup berhenti tidak wajar: melewati batas waktu atau worker kehabisan memori';
    public const SEBAB_ASING = 'Sebab tidak dikenali otomatis, lihat error mentah';

    /** Urutan tampil: yang perlu ditindak lebih dulu. */
    private const URUTAN = ['gagal' => 0, 'sebagian' => 1, 'tanpa' => 2, 'berhasil' => 3];

    /**
     * Semua waktu ISO 8601 dengan offset yang sama (zona aplikasi), jadi aman dibandingkan sebagai string.
     *
     * @param array<int, array{id: string, nama: string, tipe: string, host: string, aktif: bool, backup_terakhir: ?string}> $nodes node terdaftar saat ini
     * @param array<string, array{n: int, terakhir: string, nama: ?string}> $berhasil per node_id
     * @param array<int, array{node_id: ?string, node_name: ?string, aksi: string, error: ?string, sebab: ?string, waktu: string}> $kegagalan backup.gagal / backup.crash
     */
    public static function rangkum(array $nodes, array $berhasil, array $kegagalan): array
    {
        $gagalPer = [];
        foreach ($kegagalan as $k) {
            // Simulasi gangguan bukan kegagalan sungguhan.
            if ($k['node_id'] === null || str_starts_with((string) $k['error'], '[SIMULASI]')) {
                continue;
            }
            // Dihitung ulang dari error mentah: pola yang ditambahkan belakangan ikut
            // mengenali kegagalan lama. Sebab yang tercatat saat itu jadi cadangan.
            $k['sebab'] = $k['aksi'] === 'backup.crash'
                ? self::SEBAB_CRASH
                : (BackupErrorSummary::sebab($k['error']) ?? $k['sebab'] ?? self::SEBAB_ASING);
            $gagalPer[$k['node_id']][] = $k;
        }

        $nodeById = array_column($nodes, null, 'id');
        // Node yang sudah dihapus tetap muncul kalau punya catatan di rentang ini.
        $ids = array_unique(array_merge(array_keys($nodeById), array_map('strval', array_keys($berhasil)), array_map('strval', array_keys($gagalPer))));

        $perangkat = [];
        $nonaktif = 0;
        foreach ($ids as $id) {
            $node = $nodeById[$id] ?? null;
            $ok = $berhasil[$id] ?? null;
            $gagal = $gagalPer[$id] ?? [];
            $nOk = (int) ($ok['n'] ?? 0);
            $nGagal = count($gagal);

            if ($node && !$node['aktif'] && $nOk + $nGagal === 0) {
                $nonaktif++;
                continue;
            }

            $sebab = [];
            $gagalTerakhir = null;
            foreach ($gagal as $g) {
                $s = $sebab[$g['sebab']] ?? ['sebab' => $g['sebab'], 'jumlah' => 0, 'terakhir' => '', 'error' => null];
                $s['jumlah']++;
                if ($g['waktu'] >= $s['terakhir']) {
                    $s['terakhir'] = $g['waktu'];
                    $s['error'] = $g['error'] === null ? null : mb_substr($g['error'], 0, 1500);
                }
                $sebab[$g['sebab']] = $s;
                $gagalTerakhir = max($gagalTerakhir ?? '', $g['waktu']);
            }
            usort($sebab, fn ($a, $b) => $b['jumlah'] <=> $a['jumlah']);

            $terakhir = match (true) {
                $gagalTerakhir === null && $ok === null => null,
                $gagalTerakhir === null || ($ok !== null && $ok['terakhir'] > $gagalTerakhir) => ['status' => 'berhasil', 'waktu' => $ok['terakhir']],
                default => ['status' => 'gagal', 'waktu' => $gagalTerakhir],
            };

            $perangkat[] = [
                'id' => $id,
                'nama' => $node['nama'] ?? $ok['nama'] ?? $gagal[0]['node_name'] ?? $id,
                'tipe' => $node['tipe'] ?? null,
                'host' => $node['host'] ?? null,
                'terdaftar' => $node !== null,
                'status' => match (true) {
                    $nOk + $nGagal === 0 => 'tanpa',
                    $nGagal === 0 => 'berhasil',
                    $nOk === 0 => 'gagal',
                    default => 'sebagian',
                },
                'berhasil' => $nOk,
                'gagal' => $nGagal,
                'terakhir' => $terakhir,
                // Berhasil terakhir sepanjang masa, bukan hanya di rentang ini.
                'backup_terakhir' => $node['backup_terakhir'] ?? null,
                'sebab' => $sebab,
            ];
        }

        usort($perangkat, fn ($a, $b) => [self::URUTAN[$a['status']], $b['gagal'], $a['nama']]
            <=> [self::URUTAN[$b['status']], $a['gagal'], $b['nama']]);

        $semuaSebab = [];
        foreach ($perangkat as $p) {
            foreach ($p['sebab'] as $s) {
                $semuaSebab[$s['sebab']]['sebab'] = $s['sebab'];
                $semuaSebab[$s['sebab']]['jumlah'] = ($semuaSebab[$s['sebab']]['jumlah'] ?? 0) + $s['jumlah'];
                $semuaSebab[$s['sebab']]['perangkat'][] = $p['nama'];
            }
        }
        usort($semuaSebab, fn ($a, $b) => $b['jumlah'] <=> $a['jumlah']);

        $status = array_count_values(array_column($perangkat, 'status'));

        return [
            'ringkasan' => [
                'perangkat' => count($perangkat),
                'berhasil' => $status['berhasil'] ?? 0,
                'sebagian' => $status['sebagian'] ?? 0,
                'gagal' => $status['gagal'] ?? 0,
                'tanpa' => $status['tanpa'] ?? 0,
                'nonaktif' => $nonaktif,
                'run_berhasil' => array_sum(array_column($perangkat, 'berhasil')),
                'run_gagal' => array_sum(array_column($perangkat, 'gagal')),
            ],
            'sebab' => $semuaSebab,
            'perangkat' => $perangkat,
        ];
    }
}
