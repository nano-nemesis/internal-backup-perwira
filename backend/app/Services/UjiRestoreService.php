<?php

namespace App\Services;

use App\Support\VerifikasiBerkas;
use Symfony\Component\Process\Process;

/**
 * Restore uji: dump diimpor sungguhan ke database sementara di MySQL lokal VPS backup,
 * lalu tabel, view, trigger, dan tabel berisi data dibandingkan dengan isi dump, dan
 * database sementaranya dihapus. Satu-satunya cara membuktikan berkas bisa di-restore.
 *
 * User MySQL-nya (config backup.uji_restore) sengaja sempit, dibuat deploy/vps-setup.sh:
 *   GRANT ALL ON `uji\_restore\_%`.*          hanya database sementara, tidak bisa menyentuh yang lain
 *   GRANT SESSION_VARIABLES_ADMIN ON *.*      agar sesi impor bisa SET sql_log_bin=0
 * plus log_bin_trust_function_creators=1 di server: tanpa itu CREATE TRIGGER ditolak untuk
 * user non-SUPER selama binlog aktif (diuji di MySQL 8.0.46, 29 Okt 2026).
 */
class UjiRestoreService
{
    private const AWALAN = 'uji_restore_';

    /** Database yang diuji dari satu .tar: cukup sampel acak, bukan ratusan database. */
    private const SAMPEL_TAR = 3;

    /** @return array{status: string, ringkasan: string, database: array, pada: string, detik: int} */
    public function uji(string $path): array
    {
        $mulai = microtime(true);
        $this->bersihkanSisa();

        if (str_ends_with($path, '.tar')) {
            $hasil = $this->ujiTar($path);
        } else {
            $hasil = [$this->ujiDump(basename($path, '.sql.gz'), ['gzip', '-dc', '--', $path])];
        }

        $status = VerifikasiBerkas::terburuk($hasil);
        $lolos = count(array_filter($hasil, fn ($h) => $h['status'] !== 'gagal'));

        return [
            'status' => $status,
            'ringkasan' => "{$lolos} dari " . count($hasil) . ' database berhasil di-restore'
                . (str_ends_with($path, '.tar') ? ' (sampel acak dari arsip)' : ''),
            'database' => $hasil,
            'pada' => now()->toIso8601String(),
            'detik' => (int) (microtime(true) - $mulai),
        ];
    }

    private function ujiTar(string $path): array
    {
        $daftar = new Process(['tar', '-tf', $path], null, null, null, 600);
        $daftar->mustRun();
        $anggota = array_values(array_filter(array_map('trim', explode("\n", $daftar->getOutput())),
            fn ($a) => str_ends_with($a, '.sql.gz')));
        if (!$anggota) {
            throw new \RuntimeException('Arsip tidak berisi dump .sql.gz.');
        }
        $pilih = (array) array_rand(array_flip($anggota), min(self::SAMPEL_TAR, count($anggota)));

        $tmp = dirname($path) . '/.uji-restore-' . bin2hex(random_bytes(4));
        mkdir($tmp, 0700);
        try {
            (new Process(['tar', '-xf', $path, '-C', $tmp, ...$pilih], null, null, null, 3600))->mustRun();
            return array_map(fn ($a) => $this->ujiDump(basename($a, '.sql.gz'), ['gzip', '-dc', '--', "{$tmp}/{$a}"]), $pilih);
        } finally {
            (new Process(['rm', '-rf', '--', $tmp]))->run();
        }
    }

    /** @param string[] $sumber perintah yang menulis SQL polos ke stdout */
    private function ujiDump(string $nama, array $sumber): array
    {
        $mulai = microtime(true);
        $isi = VerifikasiBerkas::pindai($sumber);
        $item = fn (string $status, string $detail, array $tambah = []) => [
            'db' => $nama, 'status' => $status, 'detail' => $detail, 'detik' => (int) (microtime(true) - $mulai),
        ] + $tambah;

        if (!$isi['utuh']) {
            return $item('gagal', 'Berkas tidak bisa dibaca sampai akhir: ' . $isi['galat']);
        }

        $db = self::AWALAN . bin2hex(random_bytes(6));
        try {
            $this->sql("CREATE DATABASE `{$db}`");
            // DEFINER dibuang: trigger/view milik root@sumber tidak boleh dibuat user non-SUPER.
            // USE/CREATE DATABASE dibuang supaya dump yang menyebut nama database (dump
            // Virtualizor) tetap masuk ke database sementara, bukan mencoba database aslinya.
            // Dua hal khas MariaDB yang ditolak MySQL 8 dibuang/dipetakan, karena yang diuji
            // kelengkapan dump, bukan dialeknya: kolasi uca1400 (bawaan MariaDB 11) dan
            // NO_AUTO_CREATE_USER di sql_mode trigger (dihapus di MySQL 8).
            $impor = new Process(['bash', '-c',
                'set -o pipefail; db=$1; shift; "$@" | sed -E \'s/DEFINER=`[^`]*`@`[^`]*`//g; /^USE `/d; /^CREATE DATABASE/d;'
                . ' s/(utf8mb[34])_uca1400_[a-z0-9_]*/\\1_general_ci/g; s/,NO_AUTO_CREATE_USER//g; s/NO_AUTO_CREATE_USER,?//g\''
                . ' | mysql -u"$UJI_USER" --init-command="SET SESSION sql_log_bin=0" "$db"',
                '_', $db, ...$sumber], null, $this->env(), null, 3600);
            $impor->run();
            if (!$impor->isSuccessful()) {
                $mariadb = str_contains((string) $isi['server'], 'MariaDB');
                return $item('gagal', 'Impor ditolak MySQL: ' . trim(substr($impor->getErrorOutput(), 0, 500))
                    . ($mariadb ? " Dump ini dari {$isi['server']}, sedangkan restore uji memakai MySQL 8 di VPS backup: galat sintaks"
                        . ' atau kolasi khas MariaDB belum tentu berarti berkasnya rusak.' : ''));
            }

            $ada = $this->kolom("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '{$db}'");
            $tabel = array_keys(array_filter($ada, fn ($t) => $t === 'BASE TABLE'));
            $view = array_keys(array_filter($ada, fn ($t) => $t === 'VIEW'));
            $trigger = array_keys($this->kolom("SELECT trigger_name, 1 FROM information_schema.triggers WHERE trigger_schema = '{$db}'"));

            $baris = [];
            foreach (array_chunk($tabel, 200) as $potong) {
                $q = implode(' UNION ALL ', array_map(
                    fn ($t) => "SELECT '" . addslashes($t) . "', COUNT(*) FROM `{$db}`.`" . str_replace('`', '``', $t) . '`', $potong));
                $baris += $this->kolom($q);
            }

            $masalah = [];
            foreach (['tabel' => $tabel, 'view' => $view, 'trigger' => $trigger] as $jenis => $hasil) {
                if ($hilang = array_diff($isi[$jenis], $hasil)) {
                    $masalah[] = count($hilang) . " {$jenis} tidak terbentuk (" . implode(', ', array_slice($hilang, 0, 5)) . ')';
                }
            }
            if ($kosong = array_filter($isi['berisi'], fn ($t) => (int) ($baris[$t] ?? 0) === 0)) {
                $masalah[] = count($kosong) . ' tabel berisi data di dump tetapi kosong setelah restore ('
                    . implode(', ', array_slice($kosong, 0, 5)) . ')';
            }

            $ringkas = ['tabel' => count($tabel), 'view' => count($view), 'trigger' => count($trigger), 'baris' => array_sum($baris)];
            return $masalah
                ? $item('gagal', implode('; ', $masalah), $ringkas)
                : $item('ok', sprintf('Ter-restore utuh: %d tabel, %d view, %d trigger, %s baris data.',
                    $ringkas['tabel'], $ringkas['view'], $ringkas['trigger'], number_format($ringkas['baris'], 0, ',', '.')), $ringkas);
        } finally {
            $this->sql("DROP DATABASE IF EXISTS `{$db}`");
        }
    }

    /** Database sementara sisa uji yang terbunuh (worker di-restart) tidak boleh menumpuk. */
    private function bersihkanSisa(): void
    {
        foreach (array_keys($this->kolom("SELECT schema_name, 1 FROM information_schema.schemata WHERE schema_name LIKE 'uji\\\\_restore\\\\_%'")) as $db) {
            $this->sql("DROP DATABASE IF EXISTS `{$db}`");
        }
    }

    private function sql(string $query): string
    {
        // sql_log_bin=0 juga di sini: CREATE/DROP DATABASE sementara tidak perlu ada di binlog.
        $p = new Process(['bash', '-c', 'mysql -N -B -u"$UJI_USER" --init-command="SET SESSION sql_log_bin=0" -e "$1"', '_', $query],
            null, $this->env(), null, 600);
        $p->run();
        if (!$p->isSuccessful()) {
            throw new \RuntimeException('MySQL lokal untuk restore uji menolak: ' . trim($p->getErrorOutput())
                . '. Pastikan user restore uji sudah dibuat (deploy/vps-setup.sh).');
        }

        return $p->getOutput();
    }

    /** @return array<string, string> kolom pertama => kolom kedua */
    private function kolom(string $query): array
    {
        $hasil = [];
        foreach (explode("\n", trim($this->sql($query))) as $baris) {
            if ($baris !== '') {
                [$k, $v] = array_pad(explode("\t", $baris, 2), 2, '');
                $hasil[$k] = $v;
            }
        }

        return $hasil;
    }

    private function env(): array
    {
        return ['UJI_USER' => (string) config('backup.uji_restore.user'), 'MYSQL_PWD' => (string) config('backup.uji_restore.password')];
    }
}
