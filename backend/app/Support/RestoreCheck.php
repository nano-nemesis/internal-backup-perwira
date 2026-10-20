<?php

namespace App\Support;

/**
 * Simulasi restore: menilai apakah berkas backup MikroTik bisa dipulihkan ke perangkat
 * yang terpasang sekarang, TANPA menyentuh router — hanya header berkas + versi/model
 * yang tercatat. Hasilnya juga memuat langkah restore (runbook) untuk berkas itu.
 * Tesnya: php tests/restore-check.php
 */
final class RestoreCheck
{
    // 4 byte pertama .backup (little-endian), sesuai format berkas RouterOS.
    private const MAGIC_POLOS = 0xB1A1AC88;
    private const MAGIC_TERENKRIPSI = [0x7291A8EF, 0x7391A8EF]; // RC4, AES

    /**
     * @param array{version: ?string, model: ?string} $sekarang   perangkat terpasang (terakhir dibaca)
     * @param array{version: ?string, model: ?string} $saatBackup tercatat di backup_logs (kosong untuk berkas lama)
     */
    public static function periksa(string $path, array $sekarang, array $saatBackup): array
    {
        $biner = str_ends_with($path, '.backup');

        if ($biner) {
            $cek = [self::integritasBiner($path)];
        } else {
            [$item, $versi, $model] = self::integritasRsc($path);
            $cek = [$item];
            // Header .rsc lebih bisa dipercaya daripada catatan log, dan berkas lama tidak punya log.
            $saatBackup = ['version' => $versi ?? $saatBackup['version'], 'model' => $model ?? $saatBackup['model']];
        }
        $cek[] = self::cocokModel($biner, $saatBackup['model'], $sekarang['model']);
        $cek[] = self::cocokVersi($biner, $saatBackup['version'], $sekarang['version']);

        $status = array_column($cek, 'status');
        $nama = basename($path);

        return [
            'jenis'        => $biner ? 'backup' : 'rsc',
            'putusan'      => in_array('gagal', $status, true) ? 'tidak-bisa'
                            : (in_array('peringatan', $status, true) ? 'perhatian' : 'siap'),
            'versi_backup' => $saatBackup['version'],
            'model_backup' => $saatBackup['model'],
            'cek'          => $cek,
            'langkah'      => $biner ? self::langkahBiner($nama, $saatBackup) : self::langkahRsc($nama),
        ];
    }

    private static function integritasBiner(string $path): array
    {
        $judul = 'Integritas berkas';
        $ukuran = filesize($path);
        $head = (string) file_get_contents($path, false, null, 0, 8);
        if (strlen($head) < 8) {
            return self::item('gagal', $judul, 'Berkas terlalu kecil untuk sebuah backup RouterOS.');
        }
        ['magic' => $magic, 'panjang' => $panjang] = unpack('Vmagic/Vpanjang', $head);

        return match (true) {
            $magic === self::MAGIC_POLOS && $panjang === $ukuran => self::item('ok', $judul,
                "Header backup RouterOS valid dan panjang tercatatnya cocok ({$ukuran} byte) — berkas utuh."),
            $magic === self::MAGIC_POLOS => self::item('gagal', $judul,
                "Header menyebut {$panjang} byte tapi berkasnya {$ukuran} byte — berkas terpotong atau rusak."),
            in_array($magic, self::MAGIC_TERENKRIPSI, true) => self::item('peringatan', $judul,
                'Berkas terenkripsi: restore butuh password saat backup dibuat, dan keutuhannya tak bisa dicek tanpa password.'),
            default => self::item('gagal', $judul, 'Bukan berkas backup RouterOS (header tidak dikenali) — kemungkinan rusak.'),
        };
    }

    /** @return array{0: array, 1: ?string, 2: ?string} item cek, lalu versi & model dari header */
    private static function integritasRsc(string $path): array
    {
        $head = (string) file_get_contents($path, false, null, 0, 4096);
        preg_match('/by RouterOS (\S+)/', $head, $v);
        preg_match('/^# model = (.+?)\s*$/m', $head, $m);

        $item = isset($v[1])
            ? self::item('ok', 'Integritas berkas',
                'Header export RouterOS terbaca. Export yang terputus di tengah sudah ditolak saat backup, jadi isinya lengkap.')
            : self::item('peringatan', 'Integritas berkas',
                'Header "by RouterOS" tidak ditemukan — pastikan ini hasil /export yang utuh.');

        return [$item, $v[1] ?? null, $m[1] ?? null];
    }

    private static function cocokModel(bool $biner, ?string $backup, ?string $sekarang): array
    {
        $judul = 'Model perangkat';
        if (!$backup) {
            return self::item('peringatan', $judul, 'Model saat backup tidak tercatat (berkas dibuat sebelum fitur ini).');
        }
        if (!$sekarang) {
            return self::item('peringatan', $judul, "Backup dari {$backup}; model perangkat sekarang belum terbaca — klik \"Cek sekarang\".");
        }
        if (strcasecmp($backup, $sekarang) === 0) {
            return self::item('ok', $judul, "Sama: {$sekarang}.");
        }

        return $biner
            ? self::item('gagal', $judul, ".backup dari {$backup} tidak bisa dipakai di {$sekarang} — backup biner hanya untuk model yang sama. Pakai .rsc.")
            : self::item('peringatan', $judul, "Backup dari {$backup}, perangkat sekarang {$sekarang}: nama interface/port bisa beda — sunting berkasnya sebelum import.");
    }

    private static function cocokVersi(bool $biner, ?string $backup, ?string $sekarang): array
    {
        $judul = 'Versi RouterOS';
        if (!$backup) {
            return self::item('peringatan', $judul, 'Versi saat backup tidak tercatat (berkas dibuat sebelum fitur ini).');
        }
        $b = self::versi($backup);
        if (!$sekarang) {
            return self::item('peringatan', $judul, "Backup dari RouterOS {$b}; versi perangkat sekarang belum terbaca — klik \"Cek sekarang\".");
        }
        $s = self::versi($sekarang);
        if ($b === $s) {
            return self::item('ok', $judul, "Sama: {$s}.");
        }

        $lebihBaru = version_compare($b, $s, '>');
        if ($biner) {
            return $lebihBaru
                ? self::item('gagal', $judul, "Backup dibuat di RouterOS {$b}, router sekarang {$s} (lebih lama). Upgrade router ke {$b} dulu sebelum restore.")
                : self::item('peringatan', $judul, "Backup dari RouterOS {$b}, router sekarang {$s}. Paling aman samakan dulu ke {$b}, baru restore.");
        }
        if ((int) $b !== (int) $s) {
            return self::item('peringatan', $judul, "Export dari RouterOS {$b}, router sekarang {$s}: beda versi mayor, sintaks beberapa menu berubah — sebagian baris bisa gagal di-import.");
        }

        return $lebihBaru
            ? self::item('peringatan', $judul, "Export dari RouterOS {$b}, router sekarang {$s} (lebih lama): parameter baru mungkin tidak dikenal.")
            : self::item('ok', $judul, "Beda versi minor ({$b} → {$s}); import .rsc umumnya aman.");
    }

    private static function langkahBiner(string $nama, array $saatBackup): array
    {
        $model = $saatBackup['model'] ?? 'model yang sama';
        $versi = $saatBackup['version'] ? self::versi($saatBackup['version']) : 'versi saat backup';

        return [
            "Siapkan unit {$model} dengan RouterOS {$versi}. Cek dengan: /system resource print",
            "Unggah {$nama} ke router: Winbox → Files (seret berkas), atau scp -O {$nama} admin@IP-ROUTER:",
            "Jalankan: /system backup load name={$nama} password=\"\" — router akan reboot.",
            'Setelah menyala, cek: /interface print, /ip address print, /ppp active print, /log print',
            'Unit pengganti beda fisik? MAC lama ikut terpulihkan — pastikan unit lama mati, atau jalankan /interface ethernet reset-mac-address [find]',
            'Yang TIDAK ikut .backup: isi Files (halaman hotspot, berkas sertifikat), database User Manager & Dude, lisensi. Pulihkan terpisah bila dipakai.',
        ];
    }

    private static function langkahRsc(string $nama): array
    {
        return [
            "Siapkan router (boleh unit atau model lain), unggah {$nama} lewat Winbox → Files atau scp -O.",
            "Paling bersih — reset lalu jalankan otomatis: /system reset-configuration no-defaults=yes skip-backup=yes run-after-reset={$nama}",
            "Atau di router yang sudah kosong: /import file-name={$nama} verbose=yes (verbose menunjukkan baris yang gagal).",
            'Model berbeda? Sunting nama interface (ether/sfp) di berkas sebelum import.',
            'Yang TIDAK ikut .rsc: password user router (buat ulang user admin), sertifikat, isi Files (halaman hotspot), User Manager & Dude.',
            'Setelah selesai, cek: /interface print, /ip address print, /ppp secret print count-only, /log print where topics~"script"',
        ];
    }

    /** "7.23.5 (long-term)" → "7.23.5" */
    private static function versi(string $v): string
    {
        return explode(' ', trim($v))[0];
    }

    private static function item(string $status, string $judul, string $detail): array
    {
        return compact('status', 'judul', 'detail');
    }
}
