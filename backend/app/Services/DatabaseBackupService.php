<?php

namespace App\Services;

use App\Models\Node;
use App\Support\BackupDibatalkan;
use Spatie\Ssh\Ssh;
use Symfony\Component\Process\Process;

/**
 * DatabaseBackupService: Backup MySQL/MariaDB via SSH stdout
 *
 * Permission yang dibutuhkan di target server:
 *
 * 1. User SSH (minimal):
 *    - Bisa login via SSH
 *    - Bisa menjalankan `mysqldump` (harus ada di PATH, biasanya via mysql-client)
 *    - TIDAK perlu sudo atau root
 *
 * 2. User MySQL (minimal, sudah diuji di MySQL 8.4 dan MariaDB 11):
 *    CREATE USER 'backup_user'@'localhost' IDENTIFIED BY 'password';
 *    GRANT SELECT, SHOW VIEW, TRIGGER ON dbname.* TO 'backup_user'@'localhost';
 *    FLUSH PRIVILEGES;
 *
 *    SHOW VIEW dan TRIGGER bukan opsional:
 *      - tanpa SHOW VIEW, dump GAGAL kalau database punya view;
 *      - tanpa TRIGGER, dump SELESAI dan lolos pemeriksaan '-- Dump completed',
 *        tapi trigger-nya hilang tanpa satu pun pesan di stderr, backup yang
 *        terlihat utuh padahal tidak.
 *    LOCK TABLES tidak diperlukan (--single-transaction --lock-tables=false), dan
 *    EVENT juga tidak (mysqldump tidak menyertakan event tanpa --events).
 *
 * 3. Pastikan mysqldump terinstall di target server:
 *    apt install mysql-client   (Ubuntu/Debian)
 *    yum install mysql          (CentOS/RHEL)
 *
 * Flow backup:
 *   SSH → mysqldump (plain SQL stdout) → dialirkan ke gzip lokal di VPS backup → simpan .sql.gz
 *   Kalau ssh_user kosong: mysqldump lokal langsung ke MySQL target (lihat dumpDirect()).
 *   Kalau db_name = '*': semua database server, satu .sql.gz per database dalam satu .tar
 *   (lihat backupSemua(), PARALEL dump sekaligus). Grant-nya harus ON *.* supaya SHOW DATABASES melihat semuanya.
 */
class DatabaseBackupService
{
    /**
     * Isi db_name dengan ini untuk mem-backup SEMUA database di server: satu .sql.gz
     * per database, dibungkus satu .tar per run. Untuk server multi-tenant
     * (mis. ratusan database pelanggan) yang tidak mungkin dibuat satu node per database.
     */
    public const SEMUA = '*';

    /** Skema bawaan server, bukan data aplikasi. */
    private const SKEMA_SISTEM = ['information_schema', 'performance_schema', 'mysql', 'sys'];

    /**
     * Dump yang berjalan bersamaan di mode semua database. Laju tiap koneksi mysqldump
     * bisa tertahan jauh di bawah kapasitas jalur: diukur ke server BayarInternet
     * (29 Okt 2026), 1 koneksi 1 MB/s, 4 koneksi ±25 MB/s.
     * ponytail: angka tetap; jadikan setelan per node kalau ada server yang keberatan.
     */
    private const PARALEL = 4;

    /** Batas per database di mode semua database (DB terbesar BayarInternet ±320 MB). */
    private const TIMEOUT_PER_DB_SEMUA = 1800;

    /**
     * Dump yang belum mengeluarkan satu byte pun setelah sekian detik dianggap macet saat
     * login dan dicoba ulang. Ke server BayarInternet, sebagian login menggantung setelah
     * salam pembuka (dengan maupun tanpa TLS; server mencatatnya sebagai handshake error),
     * dan mysqldump tidak punya --connect-timeout, jadi tanpa ini dump menunggu sampai
     * TIMEOUT_PER_DB_SEMUA.
     */
    private const MACET_LOGIN = 30;

    private const PUTARAN_ULANG = 5;

    private const PESAN_MACET = 'kemungkinan login ke server macet';

    /**
     * @param ?\Closure(string): void $tahap dipanggil setiap pindah tahap, untuk tampilan realtime
     * @param ?\Closure(): ?string $batal nama yang meminta pembatalan, null = lanjut;
     *        dicek tiap detik selama dump, lalu BackupDibatalkan dilempar.
     */
    public function backup(Node $node, ?\Closure $tahap = null, ?\Closure $batal = null): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));

        // basename(): pertahanan berlapis kalau ada nama node lama yang tersimpan
        // sebelum validasi karakter dipasang: '../../etc' jadi 'etc', bukan
        // menulis di luar direktori backup. Nama normal tidak berubah.
        $safeName = basename($node->name);
        $localDir = storage_path("app/backups/database/{$safeName}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        if (trim((string) $node->db_name) === self::SEMUA) {
            return $this->backupSemua($node, $localDir, "backup-{$nodeName}-{$timestamp}.tar", $tahap, $batal);
        }

        $localPath = "{$localDir}/backup-{$nodeName}-{$timestamp}.sql.gz";
        $tahap?->__invoke('dump');
        // Satu database lewat jalur yang sama dengan mode semua: ikut bisa dibatalkan
        // dan ikut dijaga MACET_LOGIN. Timeout di bawah BackupJob::$timeout (300)
        // supaya error-nya jelas, bukan job terbunuh.
        $tugas = [(string) $node->db_name => $localPath];
        $ssh = $node->ssh_user ? $this->buildSsh($node) : null;
        $timeout = $node->ssh_user ? config('backup.ssh_timeout', 120) : 280;
        $gagal = $this->dumpParalel($node, $tugas, $ssh, $timeout, $batal);
        // Ulang hanya untuk login macet: galat lain (password salah, DB tidak ada)
        // akan sama persis kalau diulang.
        for ($putaran = 1; $gagal && str_contains(reset($gagal), self::PESAN_MACET) && $putaran <= self::PUTARAN_ULANG; $putaran++) {
            sleep(10);
            $gagal = $this->dumpParalel($node, $tugas, $ssh, $timeout, $batal);
        }
        if ($gagal) {
            throw new \RuntimeException(reset($gagal));
        }

        return $localPath;
    }

    /**
     * Semua database di server, PARALEL sekaligus. Satu database gagal (tabel rusak, timeout)
     * tidak menghentikan yang lain: sisanya tetap diarsipkan, lalu run dinyatakan gagal
     * dengan daftar database yang terlewat supaya tetap ada notifikasi.
     */
    private function backupSemua(Node $node, string $localDir, string $filename, ?\Closure $tahap, ?\Closure $batal): string
    {
        $tahap?->__invoke('dump');

        // Sisa run yang terbunuh (melewati batas job, worker di-restart) tidak sempat
        // dibersihkan oleh finally di bawah, dan bisa berukuran GB.
        foreach (glob("{$localDir}/.*.tmp", GLOB_ONLYDIR) ?: [] as $lama) {
            $this->hapusFolder($lama);
        }

        // Satu koneksi SSH dipakai ulang untuk ratusan perintah. Tanpa ini tiap database
        // membuka koneksi baru, dan server yang membatasi laju SSH (mis. `ufw limit`)
        // akan memblok VPS backup di tengah jalan.
        $ssh = $node->ssh_user
            ? $this->buildSsh($node)->useMultiplexing(sys_get_temp_dir() . '/ibp-ssh-%C', '60s')
            : null;

        // Koneksi ke server BayarInternet sesekali menggantung sebelum handshake;
        // percobaan berikutnya biasanya langsung jalan.
        $daftar = retry(3, fn () => $this->daftarDatabase($node, $ssh), 5000);
        if (!$daftar) {
            throw new \RuntimeException(
                "Tidak ada database yang terlihat oleh user {$node->db_user} di {$node->host}. "
                . 'Untuk mode semua database, grant-nya harus ON *.* (SELECT, SHOW VIEW, TRIGGER).'
            );
        }

        // Folder kerja tersembunyi: tidak ikut daftar Berkas Backup maupun retensi.
        $tmp = "{$localDir}/.{$filename}.tmp";
        if (!is_dir($tmp)) {
            mkdir($tmp, 0755);
        }
        $path = "{$localDir}/{$filename}";
        // Nama database boleh berisi '/', nama berkas tidak.
        $tugas = array_combine($daftar, array_map(fn ($db) => "{$tmp}/" . str_replace('/', '_', $db) . '.sql.gz', $daftar));

        try {
            $gagal = $this->dumpParalel($node, $tugas, $ssh, self::TIMEOUT_PER_DB_SEMUA, $batal);
            // Putaran ulang untuk yang gagal: gangguan sesaat (login macet) tidak membuat
            // run gagal. Yang gagal karena isinya (view rusak) tetap gagal. Ke BayarInternet
            // ±20% percobaan macet secara acak (run 29 Okt: 3 dari 371 gagal 3x), jadi
            // 6 percobaan; jeda supaya ulangan tidak jatuh di gangguan yang sama.
            for ($putaran = 1; $gagal && $putaran <= self::PUTARAN_ULANG; $putaran++) {
                sleep(10);
                $gagal = $this->dumpParalel($node, array_intersect_key($tugas, $gagal), $ssh, self::TIMEOUT_PER_DB_SEMUA, $batal);
            }

            if (count($gagal) === count($daftar)) {
                throw new \RuntimeException('Semua ' . count($daftar) . ' database gagal di-dump. Contoh: ' . reset($gagal));
            }

            // .tar tanpa kompresi: isinya sudah .sql.gz, dan satu tenant bisa diambil
            // tanpa membongkar semuanya: tar -xf berkas.tar ./namadb.sql.gz
            $tahap?->__invoke('kompres');
            (new Process(['tar', '-cf', $path, '-C', $tmp, '.'], null, null, null, null))->mustRun();
        } finally {
            $this->hapusFolder($tmp);
        }

        if ($gagal) {
            $contoh = array_map(fn ($db, $err) => "{$db}: {$err}", array_keys($gagal), $gagal);
            throw new \RuntimeException(
                'Backup tersimpan SEBAGIAN di ' . basename($path) . ': ' . count($gagal) . ' dari ' . count($daftar)
                . ' database gagal. ' . implode(' | ', array_slice($contoh, 0, 5))
                . (count($gagal) > 5 ? ' | dan ' . (count($gagal) - 5) . ' lainnya' : '')
            );
        }

        return $path;
    }

    /**
     * @param array<string, string> $tugas database => berkas .sql.gz tujuan
     * @return array<string, string> database yang gagal => pesan galat
     * @throws BackupDibatalkan semua dump yang berjalan dihentikan dan berkasnya dibuang
     */
    private function dumpParalel(Node $node, array $tugas, ?Ssh $ssh, int $timeout, ?\Closure $batal): array
    {
        $gagal = [];
        $jalan = [];
        $cekBatal = 0.0;

        while ($tugas || $jalan) {
            // Tiap detik saja: tanda batal ada di cache berkas, putaran ini jalan tiap 2 ms.
            if ($batal && microtime(true) - $cekBatal >= 1) {
                $cekBatal = microtime(true);
                if (($oleh = $batal()) !== null) {
                    foreach ($jalan as $d) {
                        $d->process->stop(0);
                        gzclose($d->gz);
                        @unlink($d->path);
                    }
                    throw new BackupDibatalkan($oleh);
                }
            }

            while ($tugas && count($jalan) < self::PARALEL) {
                // unset(), bukan array_shift(): array_shift menomori ulang kunci angka,
                // jadi database bernama '123' akan berganti nama di tengah jalan.
                $db = array_key_first($tugas);
                $path = $tugas[$db];
                unset($tugas[$db]);
                try {
                    $jalan[$db] = $this->mulaiDump($node, (string) $db, $path, $ssh, $timeout);
                } catch (\RuntimeException $e) {
                    $gagal[$db] = $e->getMessage();
                }
            }

            foreach ($jalan as $db => $d) {
                $galat = null;
                try {
                    // isRunning() sekaligus menarik keluaran yang menunggu di pipe ke berkas.
                    if ($d->process->isRunning()) {
                        $d->process->checkTimeout();
                        if ($d->awal !== '' || microtime(true) - $d->mulai < self::MACET_LOGIN) {
                            continue;
                        }
                        $d->process->stop(0);
                        throw new \RuntimeException('tidak ada data sama sekali dalam ' . self::MACET_LOGIN
                            . ' detik, ' . self::PESAN_MACET);
                    }
                } catch (\RuntimeException $e) {
                    $galat = $e;
                }
                unset($jalan[$db]);
                try {
                    $this->selesaiDump($node, $d, $galat);
                } catch (\RuntimeException $e) {
                    $gagal[$db] = $e->getMessage();
                }
            }

            // Jeda pendek: pipe (64 KB) dikuras tiap putaran, jeda panjang membatasi laju.
            usleep(2000);
        }

        return $gagal;
    }

    private function hapusFolder(string $dir): void
    {
        array_map('unlink', glob("{$dir}/*") ?: []);
        @rmdir($dir);
    }

    /** @return string[] database aplikasi yang terlihat oleh user DB node ini */
    private function daftarDatabase(Node $node, ?Ssh $ssh): array
    {
        if ($ssh) {
            $dbPass = $node->db_password ? ' -p' . escapeshellarg($node->db_password) : '';
            $process = $ssh->execute(
                'mysql -N -B --connect-timeout=15 -u' . escapeshellarg($node->db_user) . $dbPass . " -e 'SHOW DATABASES'"
            );
        } else {
            // --connect-timeout: tanpanya koneksi yang menggantung sebelum handshake
            // menunggu SYN-retry kernel (±2 menit) dan baru terlihat sebagai timeout proses.
            $process = new Process([
                'mysql', '-N', '-B', '--connect-timeout=15', '-h', $node->host, '-P', (string) ($node->port ?: 3306),
                '-u', (string) $node->db_user, '-e', 'SHOW DATABASES',
            ], null, ['MYSQL_PWD' => (string) $node->db_password], null, 30);
            $process->run();
        }

        if (!$process->isSuccessful()) {
            throw new \RuntimeException(
                "Gagal membaca daftar database di {$node->host}: " . trim($process->getErrorOutput())
            );
        }

        $nama = array_filter(array_map('trim', explode("\n", $process->getOutput())), 'strlen');

        return array_values(array_diff($nama, self::SKEMA_SISTEM));
    }

    /**
     * Mulai mysqldump satu database tanpa menunggu. Keluarannya dialirkan langsung ke
     * berkas .gz (tidak pernah utuh di memori, jadi database ber-GB aman); yang disimpan
     * hanya awal dan akhirnya untuk diperiksa selesaiDump().
     */
    private function mulaiDump(Node $node, string $db, string $gzPath, ?Ssh $ssh, int $timeout): \stdClass
    {
        // Level 1: kompresi di proses PHP tunggal tidak boleh jadi leher botol saat
        // beberapa dump mengalir bersamaan; selisih ukurannya kecil untuk SQL.
        $gz = gzopen($gzPath, 'wb1');
        if ($gz === false) {
            throw new \RuntimeException("Gagal membuka file gzip untuk ditulis: {$gzPath}");
        }

        $d = (object) ['db' => $db, 'path' => $gzPath, 'gz' => $gz, 'awal' => '', 'ekor' => '', 'err' => '', 'mulai' => microtime(true)];
        $tulis = function (string $type, string $buf) use ($d) {
            if ($type === Process::ERR) {
                $d->err = substr($d->err . $buf, 0, 2000);
                return;
            }
            if (strlen($d->awal) < 4096) {
                $d->awal .= $buf;
            }
            $d->ekor = substr($d->ekor . $buf, -1024);
            gzwrite($d->gz, $buf);
        };

        try {
            $d->process = $ssh ? $this->dumpViaSsh($node, $db, $ssh, $tulis, $timeout) : $this->dumpDirect($node, $db, $tulis, $timeout);
        } catch (\Throwable $e) {
            gzclose($gz);
            @unlink($gzPath);
            throw $e;
        }

        return $d;
    }

    /**
     * Tutup berkas dump yang prosesnya sudah berhenti, lalu pastikan isinya dump utuh.
     * Berkas yang tidak lolos dihapus. $galat = proses berhenti karena timeout.
     */
    private function selesaiDump(Node $node, \stdClass $d, ?\RuntimeException $galat = null): void
    {
        gzclose($d->gz);
        $db = $d->db;
        $err = trim($d->err);

        try {
            if ($galat) {
                throw new \RuntimeException("mysqldump {$db} dari {$node->host} dihentikan: " . $galat->getMessage());
            }

            if (trim($d->awal) === '') {
                throw new \RuntimeException(
                    "mysqldump output kosong dari {$node->host} ({$db})." .
                    ($err ? " Error: {$err}" : " Pastikan credential DB benar dan user memiliki permission SELECT.")
                );
            }

            // Exit code diperiksa terpisah: mysqldump yang mati di tengah jalan (koneksi
            // putus, OOM, lock timeout) tetap sempat menulis header, jadi cek header saja
            // meloloskan dump terpotong sebagai "sukses".
            if (!$d->process->isSuccessful()) {
                throw new \RuntimeException(
                    "mysqldump gagal di {$node->host} ({$db}, exit code {$d->process->getExitCode()}): {$err}"
                );
            }

            // Output harus DIAWALI header mysqldump. Cukup "berisi" tidak aman: teks lain
            // di depannya (MOTD, banner login) membuat berkasnya gagal di-restore.
            // '/*M!999999' = baris sandbox yang ditulis mariadb-dump baru sebelum header.
            $kepala = ltrim($d->awal);
            if (!str_starts_with($kepala, '-- MySQL dump') && !str_starts_with($kepala, '-- MariaDB dump')
                && !str_starts_with($kepala, '/*M!999999')) {
                throw new \RuntimeException(
                    "Output dari {$node->host} ({$db}) tidak diawali header mysqldump, mungkin ada MOTD/banner login: "
                    . substr(strtok($kepala, "\n"), 0, 100) . ($err ? " Error: {$err}" : '')
                );
            }

            // Penanda penutup: mysqldump hanya menulis ini setelah SELURUH dump selesai.
            // Tanpa cek ini, dump yang terpotong di tengah INSERT tetap lolos jadi backup.
            if (!str_contains($d->ekor, '-- Dump completed')) {
                throw new \RuntimeException(
                    "Dump {$db} dari {$node->host} tidak lengkap: penanda '-- Dump completed' tidak ditemukan. "
                    . "Kemungkinan koneksi terputus atau mysqldump dihentikan di tengah jalan."
                );
            }
        } catch (\RuntimeException $e) {
            @unlink($d->path);
            throw $e;
        }
    }

    private function dumpViaSsh(Node $node, string $db, Ssh $ssh, \Closure $tulis, int $timeout): Process
    {
        // Plain SQL output, no pipe to gzip: gzip di sisi target menyembunyikan exit code
        // mysqldump di balik pipe. Kompres terjadi di VPS backup (lihat mulaiDump()).
        // $node->db_password already decrypted by the model accessor
        // escapeshellarg(), bukan addslashes(): di dalam kutip tunggal shell, \' TIDAK
        // mengescape apa pun, ia menutup kutipnya. Password/nama DB berisi kutip tunggal
        // bisa keluar dari kutip dan menyuntikkan perintah ke server target.
        $dbPass = $node->db_password
            ? ' -p' . escapeshellarg($node->db_password)
            : '';

        $cmd = 'mysqldump --no-tablespaces --single-transaction --quick --lock-tables=false'
             . ' -u' . escapeshellarg($node->db_user)
             . $dbPass
             . ' ' . escapeshellarg($db);

        // JANGAN removeBash(): tanpa perintah 'bash -se', sshd membuka login shell dan
        // mencetak MOTD ("Welcome to Ubuntu ...") ke stdout, yang ikut masuk ke awal dump
        // dan membuat restore gagal di baris pertama.
        // disableOutput(): keluaran hanya lewat $tulis, tidak ditumpuk di memori.
        return $ssh
            ->setTimeout($timeout)
            ->onOutput($tulis)
            ->configureProcess(fn (Process $p) => $p->disableOutput())
            ->executeAsync($cmd);
    }

    /**
     * Mode MySQL langsung (SSH User kosong): mysqldump jalan di VPS backup ini dan
     * menyambung ke host:port MySQL target. Untuk server yang hanya membuka MySQL
     * remote tanpa SSH (mis. hosting WHMCS). `port` node di mode ini = port MySQL.
     *
     * User MySQL-nya harus diizinkan dari IP VPS backup ('user'@'IP' atau '%'),
     * dengan grant yang sama: SELECT, SHOW VIEW, TRIGGER.
     */
    private function dumpDirect(Node $node, string $db, \Closure $tulis, int $timeout): Process
    {
        // Password lewat MYSQL_PWD, bukan argumen -p: argumen terlihat oleh semua user
        // di `ps`, environment hanya oleh pemilik proses.
        // --column-statistics=0: mysqldump 8 (dari mysql-server yang dipasang
        // vps-setup.sh) gagal total ke server MariaDB/MySQL 5.7 tanpa flag ini.
        // ponytail: flag ini membuat client MariaDB menolak jalan; kalau VPS backup
        // pindah ke mariadb-client, flag-nya harus dibuang.
        $process = new Process([
            'mysqldump', '--no-tablespaces', '--single-transaction', '--quick',
            '--lock-tables=false', '--column-statistics=0',
            '-h', $node->host, '-P', (string) ($node->port ?: 3306),
            '-u', (string) $node->db_user,
            $db,
        ], null, ['MYSQL_PWD' => (string) $node->db_password], null, $timeout);

        $process->disableOutput();
        $process->start($tulis);

        return $process;
    }

    private function buildSsh(Node $node): Ssh
    {
        // Database dump butuh lebih banyak waktu dari MikroTik /export
        $timeout = config('backup.ssh_timeout', 120);

        $ssh = Ssh::create($node->ssh_user, $node->host, $node->port ?? 22)
            ->disableStrictHostKeyChecking()
            ->setTimeout($timeout);

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            return $ssh->usePrivateKey($node->ssh_key_path);
        }

        // $node->ssh_password already decrypted by the model accessor
        return $ssh->usePassword($node->ssh_password ?? '');
    }
}
