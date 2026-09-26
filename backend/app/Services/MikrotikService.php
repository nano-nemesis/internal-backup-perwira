<?php
namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Node;

class MikrotikService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.rsc";

        // basename(): pertahanan berlapis kalau ada nama node lama yang tersimpan
        // sebelum validasi karakter dipasang — '../../etc' jadi 'etc', bukan
        // menulis di luar direktori backup. Nama normal tidak berubah.
        $safeName = basename($node->name);
        $localDir = storage_path("app/backups/mikrotik/{$safeName}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }
        $localPath = "{$localDir}/{$filename}";

        // '/export' polos MENYAMARKAN secret (PPPoE/RADIUS/PSK) di RouterOS v7,
        // sehingga backup-nya tidak cukup untuk memulihkan layanan pelanggan. Flag ini
        // membuat file .rsc berisi KREDENSIAL PELANGGAN PLAINTEXT — file ditulis 0600.
        // RouterOS 6 tidak mengenal flag-nya (dan /export-nya sudah memuat secret —
        // diverifikasi di 6.49.21), jadi ada fallback ke /export polos.
        try {
            $content = $this->runSshCommand($node, '/export show-sensitive');
        } catch (\RuntimeException $e) {
            // RouterOS menolak perintah = exit code 1 (normal di v6: flag-nya belum ada,
            // v6 memang menampilkan secret). Error SSH (255) / sshpass (5,6) dilempar
            // langsung — mengulang hanya menggandakan percobaan login yang gagal.
            if (!str_contains($e->getMessage(), '(exit code 1)')) {
                throw $e;
            }
            ActivityLog::info('backup', 'mikrotik.export-polos',
                "{$node->name}: '/export show-sensitive' ditolak router, diulang dengan '/export' polos (wajar untuk RouterOS 6).",
                ['error' => $e->getMessage()], $node);
            $content = $this->runSshCommand($node, '/export');
        }

        if (empty(trim($content))) {
            throw new \RuntimeException(
                "Output /export kosong dari {$node->host}. " .
                "Pastikan user SSH memiliki policy 'read' di MikroTik."
            );
        }

        file_put_contents($localPath, $content);
        // Isinya kredensial pelanggan — jangan biarkan bisa dibaca user lain di host backup.
        chmod($localPath, 0600);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException("Gagal menyimpan file backup dari {$node->host}");
        }

        return $localPath;
    }

    public function execute(Node $node, string $command): string
    {
        return $this->runSshCommand($node, $command);
    }

    /**
     * Kirim command SSH ke MikroTik via proc_open sebagai argument (bukan heredoc).
     * spatie/ssh selalu wrap command dalam heredoc (<< \EOF-SPATIE-SSH) yang tidak
     * didukung MikroTik RouterOS 6.x, sehingga output selalu kosong.
     */
    private function runSshCommand(Node $node, string $command): string
    {
        $timeout = config('backup.ssh_timeout', 30);
        $host = $node->host;
        $port = $node->port ?? 22;
        $user = $node->ssh_user;

        // RouterOS 6.x hanya bisa tanda tangan kunci RSA dengan ssh-rsa (SHA-1), yang
        // dimatikan default sejak OpenSSH 8.8 — tanpa ini kunci tidak pernah ditawarkan
        // ("no mutual signature algorithm") dan ssh jatuh ke password.
        $baseOptions = sprintf(
            '-p %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=%d'
            . ' -o PubkeyAcceptedAlgorithms=+ssh-rsa'
            . ' -o ServerAliveInterval=15 -o ServerAliveCountMax=3',
            $port,
            $timeout
        );
        $target = escapeshellarg($user) . '@' . escapeshellarg($host) . ' ' . escapeshellarg($command);
        $password = $node->ssh_password;
        $keyError = null;

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            // BatchMode=yes: kalau kunci ditolak, ssh berhenti — bukan mengirim password
            // kosong (worker tanpa TTY) yang bisa memicu blacklist brute-force di router.
            try {
                return $this->runProcess(sprintf(
                    'ssh -i %s %s -o BatchMode=yes %s',
                    escapeshellarg($node->ssh_key_path),
                    $baseOptions,
                    $target
                ), $host);
            } catch (\RuntimeException $e) {
                // Failover ke password HANYA saat autentikasi ditolak. Timeout, koneksi
                // ditolak, atau error perintah dilempar apa adanya.
                if (!$password || !str_contains($e->getMessage(), 'Permission denied')) {
                    throw $e;
                }
                $keyError = $e->getMessage();
                ActivityLog::warning('backup', 'ssh.failover-password',
                    "{$node->name}: login SSH key ditolak router, mencoba failover ke password. "
                    . 'Periksa public key user ' . $user . ' di router supaya tidak bergantung pada password.',
                    ['key' => $node->ssh_key_path, 'error' => $keyError], $node);
            }
        }

        try {
            return $this->runProcess(sprintf(
                'sshpass -p %s ssh %s -o PubkeyAuthentication=no -o PasswordAuthentication=yes %s',
                escapeshellarg($password ?? ''),
                $baseOptions,
                $target
            ), $host);
        } catch (\RuntimeException $e) {
            if ($keyError === null) {
                throw $e;
            }
            throw new \RuntimeException(
                "Login SSH key ditolak, failover password juga gagal. Key: {$keyError} | Password: {$e->getMessage()}"
            );
        }
    }

    private function runProcess(string $sshCmd, string $host): string
    {
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
            // Buang derau "Permanently added ... known hosts" (akibat UserKnownHostsFile=/dev/null)
            // di sini, BUKAN lewat LogLevel=ERROR — itu ikut menyembunyikan pesan penting
            // seperti "Connection closed by ..." sehingga error-nya kosong.
            $error = trim(preg_replace('/^Warning: Permanently added .*$\R?/m', '', $error));
            $pesan = match (true) {
                $error !== '' => $error,
                $exitCode === 5 => 'password ditolak (sshpass exit 5)',
                default => 'tanpa pesan error dari ssh',
            };
            throw new \RuntimeException(
                "SSH command gagal ke {$host} (exit code {$exitCode}): {$pesan}"
            );
        }

        return $output;
    }
}
