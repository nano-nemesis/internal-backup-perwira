<?php

namespace App\Services;

use App\Models\Node;
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
 *   (lihat backupSemua()). Grant-nya harus ON *.* supaya SHOW DATABASES melihat semuanya.
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

    /** @param ?\Closure(string): void $tahap dipanggil setiap pindah tahap, untuk tampilan realtime */
    public function backup(Node $node, ?\Closure $tahap = null): string
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
            return $this->backupSemua($node, $localDir, "backup-{$nodeName}-{$timestamp}.tar", $tahap);
        }

        $localPath = "{$localDir}/backup-{$nodeName}-{$timestamp}.sql.gz";
        $tahap?->__invoke('dump');
        $this->dumpKe($node, (string) $node->db_name, $localPath, $node->ssh_user ? $this->buildSsh($node) : null);

        return $localPath;
    }

    /**
     * Semua database di server, satu per satu. Satu database gagal (tabel rusak, timeout)
     * tidak menghentikan yang lain: sisanya tetap diarsipkan, lalu run dinyatakan gagal
     * dengan daftar database yang terlewat supaya tetap ada notifikasi.
     */
    private function backupSemua(Node $node, string $localDir, string $filename, ?\Closure $tahap): string
    {
        $tahap?->__invoke('dump');

        // Satu koneksi SSH dipakai ulang untuk ratusan perintah. Tanpa ini tiap database
        // membuka koneksi baru, dan server yang membatasi laju SSH (mis. `ufw limit`)
        // akan memblok VPS backup di tengah jalan.
        $ssh = $node->ssh_user
            ? $this->buildSsh($node)->useMultiplexing(sys_get_temp_dir() . '/ibp-ssh-%C', '60s')
            : null;

        $daftar = $this->daftarDatabase($node, $ssh);
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
        $gagal = [];

        try {
            foreach ($daftar as $db) {
                try {
                    // Nama database boleh berisi '/', nama berkas tidak.
                    $this->dumpKe($node, $db, "{$tmp}/" . str_replace('/', '_', $db) . '.sql.gz', $ssh);
                } catch (\RuntimeException $e) {
                    $gagal[$db] = $e->getMessage();
                }
            }

            if (count($gagal) === count($daftar)) {
                throw new \RuntimeException('Semua ' . count($daftar) . ' database gagal di-dump. Contoh: ' . reset($gagal));
            }

            // .tar tanpa kompresi: isinya sudah .sql.gz, dan satu tenant bisa diambil
            // tanpa membongkar semuanya: tar -xf berkas.tar ./namadb.sql.gz
            $tahap?->__invoke('kompres');
            (new Process(['tar', '-cf', $path, '-C', $tmp, '.'], null, null, null, null))->mustRun();
        } finally {
            array_map('unlink', glob("{$tmp}/*") ?: []);
            @rmdir($tmp);
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

    /** @return string[] database aplikasi yang terlihat oleh user DB node ini */
    private function daftarDatabase(Node $node, ?Ssh $ssh): array
    {
        if ($ssh) {
            $dbPass = $node->db_password ? ' -p' . escapeshellarg($node->db_password) : '';
            $process = $ssh->execute(
                'mysql -N -B -u' . escapeshellarg($node->db_user) . $dbPass . " -e 'SHOW DATABASES'"
            );
        } else {
            $process = new Process([
                'mysql', '-N', '-B', '-h', $node->host, '-P', (string) ($node->port ?: 3306),
                '-u', (string) $node->db_user, '-e', 'SHOW DATABASES',
            ], null, ['MYSQL_PWD' => (string) $node->db_password], null, 60);
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
     * mysqldump satu database, dialirkan langsung ke berkas .gz. Dump tidak pernah utuh
     * di memori, jadi database ber-GB tidak menghabiskan memory_limit worker.
     */
    private function dumpKe(Node $node, string $db, string $gzPath, ?Ssh $ssh): void
    {
        $gz = gzopen($gzPath, 'wb6');
        if ($gz === false) {
            throw new \RuntimeException("Gagal membuka file gzip untuk ditulis: {$gzPath}");
        }

        // Yang diperiksa hanya awal (header) dan akhir (penanda selesai) dump.
        $awal = $ekor = $err = '';
        $tulis = function (string $type, string $buf) use ($gz, &$awal, &$ekor, &$err) {
            if ($type === Process::ERR) {
                $err = substr($err . $buf, 0, 2000);
                return;
            }
            if (strlen($awal) < 4096) {
                $awal .= $buf;
            }
            $ekor = substr($ekor . $buf, -1024);
            gzwrite($gz, $buf);
        };

        try {
            $process = $ssh ? $this->dumpViaSsh($node, $db, $ssh, $tulis) : $this->dumpDirect($node, $db, $tulis);
        } finally {
            gzclose($gz);
        }
        $err = trim($err);

        try {
            if (trim($awal) === '') {
                throw new \RuntimeException(
                    "mysqldump output kosong dari {$node->host} ({$db})." .
                    ($err ? " Error: {$err}" : " Pastikan credential DB benar dan user memiliki permission SELECT.")
                );
            }

            // Exit code diperiksa terpisah: mysqldump yang mati di tengah jalan (koneksi
            // putus, OOM, lock timeout) tetap sempat menulis header, jadi cek header saja
            // meloloskan dump terpotong sebagai "sukses".
            if (!$process->isSuccessful()) {
                throw new \RuntimeException(
                    "mysqldump gagal di {$node->host} ({$db}, exit code {$process->getExitCode()}): {$err}"
                );
            }

            // Output harus DIAWALI header mysqldump. Cukup "berisi" tidak aman: teks lain
            // di depannya (MOTD, banner login) membuat berkasnya gagal di-restore.
            // '/*M!999999' = baris sandbox yang ditulis mariadb-dump baru sebelum header.
            $kepala = ltrim($awal);
            if (!str_starts_with($kepala, '-- MySQL dump') && !str_starts_with($kepala, '-- MariaDB dump')
                && !str_starts_with($kepala, '/*M!999999')) {
                throw new \RuntimeException(
                    "Output dari {$node->host} ({$db}) tidak diawali header mysqldump, mungkin ada MOTD/banner login: "
                    . substr(strtok($kepala, "\n"), 0, 100) . ($err ? " Error: {$err}" : '')
                );
            }

            // Penanda penutup: mysqldump hanya menulis ini setelah SELURUH dump selesai.
            // Tanpa cek ini, dump yang terpotong di tengah INSERT tetap lolos jadi backup.
            if (!str_contains($ekor, '-- Dump completed')) {
                throw new \RuntimeException(
                    "Dump {$db} dari {$node->host} tidak lengkap: penanda '-- Dump completed' tidak ditemukan. "
                    . "Kemungkinan koneksi terputus atau mysqldump dihentikan di tengah jalan."
                );
            }
        } catch (\RuntimeException $e) {
            @unlink($gzPath);
            throw $e;
        }
    }

    private function dumpViaSsh(Node $node, string $db, Ssh $ssh, \Closure $tulis): Process
    {
        // Plain SQL output, no pipe to gzip: gzip di sisi target menyembunyikan exit code
        // mysqldump di balik pipe. Kompres terjadi di VPS backup (lihat dumpKe()).
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
            ->onOutput($tulis)
            ->configureProcess(fn (Process $p) => $p->disableOutput())
            ->execute($cmd);
    }

    /**
     * Mode MySQL langsung (SSH User kosong): mysqldump jalan di VPS backup ini dan
     * menyambung ke host:port MySQL target. Untuk server yang hanya membuka MySQL
     * remote tanpa SSH (mis. hosting WHMCS). `port` node di mode ini = port MySQL.
     *
     * User MySQL-nya harus diizinkan dari IP VPS backup ('user'@'IP' atau '%'),
     * dengan grant yang sama: SELECT, SHOW VIEW, TRIGGER.
     */
    private function dumpDirect(Node $node, string $db, \Closure $tulis): Process
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
        ], null, ['MYSQL_PWD' => (string) $node->db_password], null,
            // Per database. Di bawah BackupJob::$timeout (300) supaya error-nya jelas,
            // bukan job terbunuh; mode semua database punya batas job sendiri.
            280);

        $process->disableOutput();
        $process->run($tulis);

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
