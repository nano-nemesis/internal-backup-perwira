<?php
namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Node;
use App\Support\Langkah;
use App\Support\RouterDoctor;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class MikrotikService
{
    /** @param ?\Closure(string): void $tahap dipanggil setiap pindah tahap, untuk tampilan realtime */
    public function backup(Node $node, ?\Closure $tahap = null): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.rsc";

        // basename(): pertahanan berlapis kalau ada nama node lama yang tersimpan
        // sebelum validasi karakter dipasang: '../../etc' jadi 'etc', bukan
        // menulis di luar direktori backup. Nama normal tidak berubah.
        $safeName = basename($node->name);
        $localDir = storage_path("app/backups/mikrotik/{$safeName}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }
        $localPath = "{$localDir}/{$filename}";

        if ($node->backup_binary) {
            $binaryPath = preg_replace('/\.rsc$/', '.backup', $localPath);
            $this->backupBinary($node, $binaryPath, $now->format('Ymd-His'), $tahap);
            return $binaryPath;
        }

        // '/export' polos MENYAMARKAN secret (PPPoE/RADIUS/PSK) di RouterOS v7,
        // sehingga backup-nya tidak cukup untuk memulihkan layanan pelanggan. Flag ini
        // membuat file .rsc berisi KREDENSIAL PELANGGAN PLAINTEXT, file ditulis 0600.
        // RouterOS 6 tidak mengenal flag-nya (dan /export-nya sudah memuat secret,
        // diverifikasi di 6.49.21), jadi ada fallback ke /export polos.
        $tahap?->__invoke('ambil');
        try {
            $content = $this->runSshCommand($node, '/export show-sensitive');
        } catch (\RuntimeException $e) {
            // RouterOS menolak perintah = exit code 1 (normal di v6: flag-nya belum ada,
            // v6 memang menampilkan secret). Error SSH (255) / sshpass (5,6) dilempar
            // langsung, mengulang hanya menggandakan percobaan login yang gagal.
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
        // Isinya kredensial pelanggan, jangan biarkan bisa dibaca user lain di host backup.
        chmod($localPath, 0600);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException("Gagal menyimpan file backup dari {$node->host}");
        }

        return $localPath;
    }

    /**
     * Backup biner: /system backup save, tarik lewat scp, hapus dari flash router.
     *
     * Hanya bisa dipulihkan ke unit dengan model + versi RouterOS yang sama, untuk
     * pindah perangkat pakai .rsc. Butuh policy write + policy + ftp di user router.
     */
    private function backupBinary(Node $node, string $localPath, string $stamp, ?\Closure $tahap = null): void
    {
        // Nama unik per run, bukan nama tetap: kalau penghapusan di router pernah gagal,
        // berkas lama yang tertinggal tidak bisa tertarik sebagai backup "baru".
        $remote = "perwira-{$stamp}.backup";

        try {
            // dont-encrypt eksplisit: default enkripsi berubah antar versi RouterOS, dan
            // berkas harus bisa di-restore tanpa password user backup.
            $tahap?->__invoke('simpan');
            $this->runRouterCommand($node, "/system backup save name=perwira-{$stamp} dont-encrypt=yes");
            try {
                $tahap?->__invoke('salin');
                $this->scpPull($node, $remote, $localPath);
            } finally {
                try {
                    $this->runRouterCommand($node, "/file remove {$remote}");
                } catch (\RuntimeException $e) {
                    ActivityLog::warning('backup', 'mikrotik.backup-biner-sisa',
                        "{$node->name}: berkas {$remote} gagal dihapus dari router dan masih memakan flash. Hapus manual.",
                        ['error' => $e->getMessage()], $node);
                }
            }

            if (!is_file($localPath) || filesize($localPath) === 0) {
                throw new \RuntimeException("Berkas {$remote} kosong setelah ditarik dari {$node->host}");
            }
            // Memuat seluruh konfigurasi + database user router.
            chmod($localPath, 0600);
        } catch (\RuntimeException $e) {
            // Jangan tinggalkan berkas setengah jadi yang tampak seperti backup sah.
            if (is_file($localPath)) {
                unlink($localPath);
            }
            throw $e;
        }
    }

    /**
     * RouterOS keluar dengan exit 0 walau perintahnya ditolak ("Failed to save ...",
     * "not enough permissions (9)"): tanpa membaca output, kegagalan lolos sebagai sukses.
     */
    private function runRouterCommand(Node $node, string $command): string
    {
        $output = $this->runSshCommand($node, $command);
        if (preg_match('/failed|not enough permissions/i', $output)) {
            throw new \RuntimeException("Router {$node->host} menolak '{$command}': " . trim($output));
        }

        return $output;
    }

    /**
     * Baca versi + model RouterOS langsung dari router dan simpan ke node.
     * Model diambil dari routerboard (sama dengan "# model =" di header .rsc); CHR/x86
     * tidak punya routerboard, jadi jatuh ke board-name. Teruji di ROS 6.49, 7.23, CHR.
     *
     * @return array{version: string, model: string}
     */
    public function refreshDeviceInfo(Node $node): array
    {
        $output = $this->runRouterCommand($node,
            ':local m [/system resource get board-name]; '
            . ':do {:local r [/system routerboard get model]; :if ([:len $r] > 0) do={:set m $r}} on-error={}; '
            . ':put ([/system resource get version] . "|" . $m)');

        [$version, $model] = array_pad(explode('|', trim($output), 2), 2, '');
        if ($version === '') {
            throw new \RuntimeException("Versi RouterOS tidak terbaca dari {$node->host}: " . trim($output));
        }

        $node->update([
            'routeros_version'    => $version,
            'routeros_model'      => $model ?: null,
            'routeros_checked_at' => now(),
        ]);

        return ['version' => $version, 'model' => $model];
    }

    /**
     * Doctor: satu sesi SSH berisi perintah baca saja, dinilai RouterDoctor, disimpan di node.
     * Kalau router tak terjangkau, galatnya ikut disimpan supaya dashboard tidak menampilkan
     * laporan lama seolah masih berlaku.
     */
    public function runDoctor(Node $node): array
    {
        try {
            $laporan = RouterDoctor::periksa(
                RouterDoctor::parse($this->runSshCommand($node, RouterDoctor::script())),
                $this->versiTerbaru(),
                \App\Support\DoctorStandar::tersimpan(),
            );
        } catch (\RuntimeException $e) {
            $node->update(['doctor_report' => ['galat' => $e->getMessage()], 'doctor_checked_at' => now()]);
            throw $e;
        }
        $lama = $node->doctor_report;
        $node->update(['doctor_report' => $laporan, 'doctor_checked_at' => now()]);

        // Satu-satunya tempat laporan berganti (backup, Periksa sekarang, Periksa semua),
        // jadi perubahan menjadi kritis tidak terlewat dari jalur mana pun.
        if ($baru = RouterDoctor::kritisBaru($lama, $laporan)) {
            try {
                app(TelegramNotifier::class)->notifyDoctorKritis($node, $baru);
            } catch (\Throwable) {
                // Notifikasi gagal tidak boleh menggagalkan doctor; kegagalan kirim sudah dicatat notifier.
            }
        }

        return $laporan;
    }

    /** Versi RouterOS terbaru per kanal dari server pembaruan MikroTik ("7.23.8 1791452776"), cache 6 jam. */
    private function versiTerbaru(): array
    {
        if ($versi = Cache::get('routeros-terbaru')) {
            return $versi;
        }
        $versi = [];
        foreach (['a7.long-term', 'a7.stable', '6.long-term', '6.stable'] as $kanal) {
            try {
                $res = Http::timeout(5)->get("https://upgrade.mikrotik.com/routeros/NEWEST{$kanal}");
                if ($res->ok() && preg_match('/^\d+\.[\d.]+(rc\d+|beta\d+)?/', trim($res->body()), $m)) {
                    $versi[$kanal] = $m[0];
                }
            } catch (\Throwable) {
            }
        }
        // Gagal total (internet putus) tidak di-cache, supaya pemeriksaan berikutnya mencoba lagi.
        if ($versi) {
            Cache::put('routeros-terbaru', $versi, now()->addHours(6));
        }

        return $versi;
    }

    /**
     * Uji backup tanpa menyimpan apa pun: login SSH, policy user (sesuai tipe backup), dan
     * export kecil sungguhan. Tidak menulis berkas di router maupun di VPS backup.
     * @return array{status: string, langkah: array}
     */
    public function uji(Node $node): array
    {
        $l = new Langkah();
        try {
            $info = trim($this->runSshCommand($node,
                ':put ([/system identity get name] . "|" . [/system resource get version] . "|" . [/system resource get free-hdd-space])'));
            [$nama, $versi, $flash] = explode('|', $info) + [1 => '?', 2 => '0'];
            $l->catat('ok', 'Login SSH', "Masuk sebagai {$node->ssh_user} ke router {$nama}, RouterOS {$versi}.");
        } catch (\RuntimeException $e) {
            $l->catat('gagal', 'Login SSH', $e->getMessage());
            return $l->hasil();
        }

        try {
            $this->ujiSesudahLogin($node, (int) $flash, $l);
        } catch (\RuntimeException $e) {
            $l->catat('gagal', 'Pemeriksaan terhenti', $e->getMessage());
        }

        return $l->hasil();
    }

    private function ujiSesudahLogin(Node $node, int $flash, Langkah $l): void
    {
        // Nama user masuk ke skrip RouterOS di dalam kutip: tolak karakter yang bisa keluar dari kutip.
        if (preg_match('/["\\\\$;\[\]]/', (string) $node->ssh_user)) {
            $l->catat('peringatan', 'Policy user', 'Nama user berisi karakter khusus, policy-nya tidak diperiksa.');
        } else {
            $policy = trim($this->runSshCommand($node,
                ":put [/user group get [/user get [find name=\"{$node->ssh_user}\"] group] policy]"));
            // :put sebuah list bisa memakai ';' (array) atau ',' (teks), tergantung versi.
            $punya = array_filter(array_map('trim', preg_split('/[,;]/', $policy)), fn ($p) => $p !== '' && $p[0] !== '!');
            $wajib = $node->backup_binary ? ['ssh', 'read', 'write', 'policy', 'ftp', 'sensitive'] : ['ssh', 'read', 'sensitive'];
            $kurang = array_values(array_diff($wajib, $punya));
            $l->catat($kurang ? 'gagal' : 'ok', 'Policy user', $kurang
                ? 'Kurang policy ' . implode(', ', $kurang) . '. '
                    . (in_array('sensitive', $kurang, true) ? 'Tanpa sensitive, password PPPoE/RADIUS/PSK keluar sebagai *** dan backup tampak utuh padahal tidak bisa memulihkan layanan. ' : '')
                    . ($node->backup_binary ? 'Backup biner butuh write, policy, dan ftp untuk menyimpan dan menarik berkas.' : '')
                : 'Policy ' . implode(', ', $wajib) . ' lengkap untuk ' . ($node->backup_binary ? 'backup biner (.backup).' : 'export (.rsc).'));
        }

        if ($node->backup_binary) {
            // Backup biner sungguhan menulis ke flash router; yang diuji di sini ruangnya saja.
            $l->catat($flash > 0 && $flash < 2 * 1024 * 1024 ? 'peringatan' : 'ok', 'Ruang flash router',
                'Sisa flash ' . round($flash / 1048576, 1) . ' MB; berkas .backup sementara ditulis di sana lalu dihapus setelah ditarik.');
            return;
        }

        try {
            $out = $this->runSshCommand($node, '/system identity export show-sensitive');
        } catch (\RuntimeException $e) {
            // RouterOS 6 tidak mengenal show-sensitive (exit 1), sama seperti di backup().
            if (!str_contains($e->getMessage(), '(exit code 1)')) {
                throw $e;
            }
            $out = $this->runSshCommand($node, '/system identity export');
        }
        $l->catat(str_contains($out, 'by RouterOS') ? 'ok' : 'gagal', 'Uji export', str_contains($out, 'by RouterOS')
            ? 'Export kecil (/system identity) berhasil dan berheader RouterOS; /export lengkap akan berjalan dengan cara yang sama.'
            : 'Output export tidak berheader RouterOS: ' . mb_substr(trim($out), 0, 200));
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
        $target = escapeshellarg($node->ssh_user) . '@' . escapeshellarg($node->host) . ' ' . escapeshellarg($command);

        return $this->runAuthenticated($node, 'ssh -p', $target);
    }

    /**
     * Tarik berkas dari router dengan autentikasi yang sama (kunci, failover password).
     * -O = protokol SCP lama: OpenSSH >= 9.0 memakai SFTP secara default.
     */
    private function scpPull(Node $node, string $remote, string $localPath): void
    {
        // IPv6 wajib berkurung siku di sintaks scp host:path.
        $host = str_contains($node->host, ':') ? "[{$node->host}]" : $node->host;
        $target = escapeshellarg($node->ssh_user) . '@' . escapeshellarg($host) . ':' . escapeshellarg($remote)
            . ' ' . escapeshellarg($localPath);

        $this->runAuthenticated($node, 'scp -O -P', $target);
    }

    /** @param string $program 'ssh -p' atau 'scp -O -P', flag port-nya beda huruf. */
    private function runAuthenticated(Node $node, string $program, string $target): string
    {
        $timeout = config('backup.ssh_timeout', 30);
        $host = $node->host;
        $port = $node->port ?? 22;
        $user = $node->ssh_user;

        // RouterOS 6.x hanya bisa tanda tangan kunci RSA dengan ssh-rsa (SHA-1), yang
        // dimatikan default sejak OpenSSH 8.8, tanpa ini kunci tidak pernah ditawarkan
        // ("no mutual signature algorithm") dan ssh jatuh ke password.
        $baseOptions = sprintf(
            '%s %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=%d'
            . ' -o PubkeyAcceptedAlgorithms=+ssh-rsa'
            . ' -o ServerAliveInterval=15 -o ServerAliveCountMax=3',
            $program,
            $port,
            $timeout
        );
        $password = $node->ssh_password;
        $keyError = null;

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            // BatchMode=yes: kalau kunci ditolak, ssh berhenti, bukan mengirim password
            // kosong (worker tanpa TTY) yang bisa memicu blacklist brute-force di router.
            try {
                return $this->runProcess(sprintf(
                    '%s -i %s -o BatchMode=yes %s',
                    $baseOptions,
                    escapeshellarg($node->ssh_key_path),
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
                'sshpass -p %s %s -o PubkeyAuthentication=no -o PasswordAuthentication=yes %s',
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
        // backup "sukses", file .rsc terpotong yang baru ketahuan saat restore.
        if ($exitCode !== 0) {
            // Buang derau "Permanently added ... known hosts" (akibat UserKnownHostsFile=/dev/null)
            // di sini, BUKAN lewat LogLevel=ERROR, itu ikut menyembunyikan pesan penting
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
