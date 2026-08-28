<?php

namespace App\Services;

use App\Models\Node;
use Illuminate\Support\Facades\Log;

/**
 * VirtualizorBackupService — Pull backup DB dari Virtualizor node via SCP
 *
 * Virtualizor menyimpan backup database-nya sendiri di:
 *   /var/virtualizor/backup/db/YYYYMMDD.sql.gz
 *
 * Strategy: SCP pull file terbaru → simpan lokal di VPS backup.
 * Tidak perlu regenerate backup — file sudah ada dan siap diambil.
 *
 * Permission yang dibutuhkan di Virtualizor node:
 *   - SSH user dengan akses baca ke /var/virtualizor/backup/db/
 *   - Biasanya root atau user dengan sudo read access
 *   - Atau: buat dedicated user + setfacl read-only ke folder tersebut
 *
 * Konfigurasi Node (type = 'virtualizor_db'):
 *   - host          : IP/hostname Virtualizor node
 *   - port          : SSH port (default 22)
 *   - ssh_user      : SSH user (biasanya root)
 *   - ssh_password  : SSH password (atau gunakan ssh_key_path)
 *   - ssh_key_path  : Path ke private key (lebih direkomendasikan)
 *   - db_name       : (opsional) override path backup dir, default: /var/virtualizor/backup/db
 *
 * Note tentang db_name:
 *   Field db_name direpurpose sebagai "backup_dir_path" untuk node tipe ini.
 *   Kalau dikosongkan, fallback ke default path Virtualizor.
 *   Ini menghindari perlu tambah kolom baru di tabel nodes.
 */
class VirtualizorBackupService
{
    /**
     * Default path backup DB Virtualizor di node target.
     * Bisa di-override via $node->db_name.
     */
    private const DEFAULT_BACKUP_DIR = '/var/virtualizor/backup/db';

    public function backup(Node $node): string
    {
        $remoteDir = $node->db_name ?: self::DEFAULT_BACKUP_DIR;

        // 1. List file di remote dir, ambil yang paling baru
        $latestFile = $this->getLatestRemoteFile($node, $remoteDir);

        if (!$latestFile) {
            throw new \RuntimeException(
                "Tidak ada file backup ditemukan di {$node->host}:{$remoteDir}. "
                . "Pastikan Virtualizor sudah menjalankan backup dan path benar."
            );
        }

        $this->assertNotStale($node, $latestFile);

        $remoteFilePath = rtrim($remoteDir, '/') . '/' . $latestFile;

        // 2. Cek apakah file ini sudah pernah didownload sebelumnya
        // (hindari re-download file yang sama berulang kali)
        // basename(): pertahanan berlapis kalau ada nama node lama yang tersimpan
        // sebelum validasi karakter dipasang — '../../etc' jadi 'etc', bukan
        // menulis di luar direktori backup. Nama normal tidak berubah.
        $safeName = basename($node->name);
        $localDir = storage_path("app/backups/virtualizor/{$safeName}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$latestFile}";

        if (file_exists($localPath) && filesize($localPath) > 0) {
            Log::info("VirtualizorBackupService: file [{$latestFile}] sudah ada lokal, skip download.");
            return $localPath;
        }

        // 3. SCP pull file dari remote
        $this->scpPull($node, $remoteFilePath, $localPath);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException(
                "SCP berhasil tapi file kosong atau tidak ada: {$localPath}"
            );
        }

        Log::info(sprintf(
            "VirtualizorBackupService: berhasil pull [%s] dari %s (%.2f KB)",
            $latestFile,
            $node->host,
            filesize($localPath) / 1024
        ));

        return $localPath;
    }

    /**
     * ponytail: ambang 2 hari mengasumsikan Virtualizor membuat dump HARIAN.
     * Kalau cadence-nya berubah, ubah angka ini — bukan menghapus pemeriksaannya.
     */
    private const MAX_AGE_DAYS = 2;

    /**
     * Tolak kalau file terbaru di remote sudah basi.
     *
     * Tanpa ini, Virtualizor yang berhenti membuat dump baru tidak pernah ketahuan:
     * file terlama tetap jadi "yang terbaru", salinan lokalnya sudah ada sehingga
     * langsung di-skip, dan BackupService menandainya `success` + kirim notifikasi
     * sukses ke Telegram — setiap siklus, selamanya. Retensi bahkan menghapus salinan
     * lokalnya tiap 7 hari lalu file basi yang sama diunduh ulang dengan mtime baru,
     * jadi dari luar terlihat selalu segar.
     *
     * Tanggal dibaca dari nama berkas (YYYYMMDD) — asumsi yang sudah dipakai kode ini
     * saat mengurutkan file secara leksikografis. Kalau namanya tidak berformat tanggal,
     * kesegaran tidak bisa disimpulkan dan pemeriksaan dilewati dengan peringatan;
     * ganti ke `stat -c %Y` lewat SSH kalau itu jadi masalah nyata.
     */
    private function assertNotStale(Node $node, string $filename): void
    {
        if (!preg_match('/^(\d{4})(\d{2})(\d{2})/', $filename, $m)
            || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            Log::warning(
                "VirtualizorBackupService: nama berkas [{$filename}] dari {$node->host} tidak "
                . "berformat tanggal yang valid — kesegaran backup tidak bisa diperiksa."
            );
            return;
        }

        $tz = 'Asia/Jakarta';
        $fileDate = \Carbon\Carbon::create((int) $m[1], (int) $m[2], (int) $m[3], 0, 0, 0, $tz);
        $today = \Carbon\Carbon::now($tz)->startOfDay();

        // Signed: jam node target yang maju bikin tanggal berada di masa depan —
        // itu bukan "basi", jadi jangan dilaporkan sebagai kegagalan.
        $ageDays = (int) $fileDate->diffInDays($today, false);

        if ($ageDays > self::MAX_AGE_DAYS) {
            throw new \RuntimeException(sprintf(
                'Backup terbaru di %s sudah basi: [%s] berumur %d hari. '
                . 'Virtualizor kemungkinan berhenti membuat dump baru — periksa cron backup di node tersebut.',
                $node->host,
                $filename,
                $ageDays
            ));
        }
    }

    /**
     * Ambil nama file backup terbaru dari remote dir.
     * Virtualizor menggunakan format YYYYMMDD.sql.gz (contoh: 20240925.sql.gz)
     * sehingga sort lexicographic = sort chronological.
     */
    private function getLatestRemoteFile(Node $node, string $remoteDir): ?string
    {
        // ls -1 → satu file per baris, sort → urutkan, tail -1 → ambil yang terbaru
        $cmd = sprintf(
            'ls -1 %s/*.sql.gz 2>/dev/null | sort | tail -1 | xargs -I{} basename {}',
            escapeshellarg($remoteDir)
        );

        $output = trim($this->runSshCommand($node, $cmd));

        if (empty($output)) {
            return null;
        }

        // Validasi format nama file (hanya izinkan karakter aman)
        if (!preg_match('/^[\w\-\.]+\.sql\.gz$/', $output)) {
            throw new \RuntimeException(
                "Format nama file tidak valid dari remote: [{$output}]. "
                . "Mungkin ada masalah di remote dir atau file tidak sesuai format."
            );
        }

        return $output;
    }

    /**
     * Pull file via SCP dari remote ke lokal.
     * Menggunakan proc_open sama seperti MikrotikService untuk konsistensi
     * dan menghindari masalah heredoc.
     */
    private function scpPull(Node $node, string $remotePath, string $localPath): void
    {
        $timeout = config('backup.ssh_timeout', 120);
        $host = $node->host;
        $port = $node->port ?? 22;
        $user = $node->ssh_user;

        $baseOptions = sprintf(
            '-P %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=%d -o BatchMode=no',
            $port,
            $timeout
        );

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            $scpCmd = sprintf(
                'scp -i %s %s %s@%s:%s %s',
                escapeshellarg($node->ssh_key_path),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($remotePath),
                escapeshellarg($localPath)
            );
        } else {
            $password = $node->ssh_password ?? '';
            $scpCmd = sprintf(
                'sshpass -p %s scp %s -o PasswordAuthentication=yes %s@%s:%s %s',
                escapeshellarg($password),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($remotePath),
                escapeshellarg($localPath)
            );
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($scpCmd, $descriptors, $pipes);

        if (!is_resource($process)) {
            throw new \RuntimeException("Gagal membuka proses SCP ke {$host}");
        }

        fclose($pipes[0]);
        // stdout HARUS ikut dikuras: kalau tidak, scp yang menulis cukup banyak ke
        // stdout memblokir saat buffer pipe penuh sementara PHP menunggu stderr.
        stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        if ($exitCode !== 0) {
            // Bersihkan file partial kalau SCP gagal
            if (file_exists($localPath)) {
                unlink($localPath);
            }
            throw new \RuntimeException(
                "SCP gagal dari {$host}:{$remotePath} (exit code {$exitCode}): " . trim($stderr)
            );
        }
    }

    /**
     * Jalankan SSH command di remote node.
     * Sama persis polanya dengan MikrotikService::runSshCommand().
     */
    private function runSshCommand(Node $node, string $command): string
    {
        $timeout = config('backup.ssh_timeout', 120);
        $host = $node->host;
        $port = $node->port ?? 22;
        $user = $node->ssh_user;

        $baseOptions = sprintf(
            '-p %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=%d -o BatchMode=no',
            $port,
            $timeout
        );

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            $sshCmd = sprintf(
                'ssh -i %s %s %s@%s %s',
                escapeshellarg($node->ssh_key_path),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($command)
            );
        } else {
            $password = $node->ssh_password ?? '';
            $sshCmd = sprintf(
                'sshpass -p %s ssh %s -o PasswordAuthentication=yes %s@%s %s',
                escapeshellarg($password),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($command)
            );
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($sshCmd, $descriptors, $pipes);

        if (!is_resource($process)) {
            throw new \RuntimeException("Gagal membuka proses SSH ke {$host}");
        }

        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        $error  = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        // Exit code diperiksa sendiri, TIDAK digabung dengan cek output kosong.
        // Kalau digabung, koneksi yang putus di tengah /export (router reboot, blip
        // jaringan) menyisakan output parsial + exit code gagal, lalu lolos sebagai
        // backup "sukses" — file .rsc terpotong yang baru ketahuan saat restore.
        if ($exitCode !== 0) {
            throw new \RuntimeException(
                "SSH command gagal ke {$host} (exit code {$exitCode}): " . trim($error)
            );
        }

        return $output;
    }
}
