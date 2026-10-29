<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\BackupLog;
use App\Models\Node;
use App\Support\BackupDibatalkan;
use App\Support\BackupErrorSummary;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class BackupService
{
    public function __construct(
        private MikrotikService $mikrotik,
        private DatabaseBackupService $database,
        private TelegramNotifier $telegram,
        private VirtualizorBackupService $virtualizor,
    ) {}

    public function run(Node $node, ?string $pemicu = null, bool $simulasi = false): BackupLog
    {
        $cara = match (true) {
            $simulasi => "SIMULASI gangguan oleh {$pemicu}",
            $pemicu !== null => "manual oleh {$pemicu}",
            default => 'terjadwal',
        };
        ActivityLog::info('backup', 'backup.mulai', "Backup {$node->name} ({$node->type}, {$node->host}) dimulai ({$cara}).", [
            'pemicu' => $pemicu ?? 'jadwal',
            'host'   => "{$node->host}:" . ($node->port ?? 22),
            'user'   => $node->ssh_user,
        ], $node);

        $log = BackupLog::create([
            'node_id' => $node->id,
            'status' => 'running',
            'started_at' => now(),
            'created_at' => now(),
        ]);

        $startTime = microtime(true);
        // Tahap ditulis ke log supaya halaman bisa menampilkan proses backup secara langsung.
        $tahap = fn (string $t) => $log->update(['tahap' => $t]);
        // Tombol Batalkan menulis tanda ini; jalur dump database membacanya tiap detik.
        $batal = fn () => Cache::get(BackupDibatalkan::kunci($log->id));

        try {
            $filePath = match ($node->type) {
                'mikrotik'       => $this->mikrotik->backup($node, $tahap),
                'database'       => $this->database->backup($node, $tahap, $batal),
                'virtualizor_db' => $this->virtualizor->backup($node, $tahap),
                default          => throw new \RuntimeException("Unknown node type: {$node->type}"),
            };

            // Node simulasi adalah salinan ber-host palsu; sukses di sini berarti targetnya
            // ternyata menjawab, dan $node->update() di bawah akan menyimpan host palsu itu.
            if ($simulasi) {
                throw new \RuntimeException("Target simulasi {$node->host} ternyata menjawab, simulasi dibatalkan.");
            }

            $duration = (int) (microtime(true) - $startTime);
            $tahap('periksa');
            $fileSize = file_exists($filePath) ? filesize($filePath) : 0;

            // Versi + model saat backup dibuat, syarat menilai apakah .backup bisa
            // di-restore nanti. Gagal membacanya tidak menggagalkan backup yang sudah jadi.
            if ($node->type === 'mikrotik') {
                $tahap('doctor');
                try {
                    $this->mikrotik->refreshDeviceInfo($node);
                } catch (\RuntimeException) {
                }
                // Laporan doctor ikut diperbarui tiap backup, jadi dashboard selalu sesegar backup terakhir.
                try {
                    $this->mikrotik->runDoctor($node);
                } catch (\RuntimeException) {
                }
            }

            $log->update([
                'status' => 'success',
                'tahap' => null,
                'file_path' => $filePath,
                'file_size' => $fileSize,
                'duration_seconds' => $duration,
                'finished_at' => now(),
                'routeros_version' => $node->routeros_version,
                'routeros_model' => $node->routeros_model,
            ]);

            $node->update(['last_backup_at' => now()]);

            $telegram = $this->telegram->notifySuccess($node, $log->fresh());
            ActivityLog::info('backup', 'backup.berhasil',
                "Backup {$node->name} berhasil: " . basename($filePath) . ' (' . $log->fresh()->file_size_formatted . ", {$duration} detik).",
                ['file' => basename($filePath), 'ukuran_byte' => $fileSize, 'durasi_detik' => $duration, 'pemicu' => $pemicu ?? 'jadwal', 'telegram' => $telegram],
                $node,
            );
            $this->cleanOldBackups($node);

        } catch (BackupDibatalkan $e) {
            // Disengaja pengguna: bukan kegagalan, jadi tanpa Telegram dan tanpa status merah.
            $duration = (int) (microtime(true) - $startTime);
            $log->update([
                'status' => 'cancelled',
                'error_message' => $e->getMessage(),
                'duration_seconds' => $duration,
                'finished_at' => now(),
            ]);
            Cache::forget(BackupDibatalkan::kunci($log->id));
            ActivityLog::info('backup', 'backup.dibatalkan',
                "Backup {$node->name} dibatalkan oleh {$e->oleh} setelah {$duration} detik.",
                ['oleh' => $e->oleh, 'durasi_detik' => $duration, 'tahap' => $log->tahap], $node);
        } catch (\Exception $e) {
            $duration = (int) (microtime(true) - $startTime);
            $error = ($simulasi ? '[SIMULASI] ' : '') . $e->getMessage();

            // tahap sengaja tidak dikosongkan: menunjukkan di tahap mana backup gagal.
            $log->update([
                'status' => 'failed',
                'error_message' => $error,
                'duration_seconds' => $duration,
                'finished_at' => now(),
            ]);

            // Pesan dibuka dengan SEBAB yang bisa ditindaklanjuti; error mentah tetap
            // disimpan utuh di konteks untuk penelusuran.
            $sebab = BackupErrorSummary::sebab($error);
            // Dikirim dulu supaya hasilnya (terkirim/dimatikan/jeda/gagal) ikut tercatat di Log Sistem.
            $telegram = $this->telegram->notifyFailure($node, $error);
            ActivityLog::error('backup', 'backup.gagal',
                "Backup {$node->name} ({$node->host}) gagal setelah {$duration} detik. "
                . ($sebab ? "Kemungkinan sebab: {$sebab}." : 'Sebab tidak dikenali otomatis, lihat error mentah di detail.'),
                ['error' => $error, 'sebab' => $sebab, 'durasi_detik' => $duration, 'pemicu' => $pemicu ?? 'jadwal', 'telegram' => $telegram],
                $node,
            );
        }

        return $log->fresh();
    }

    /**
     * Gangguan SUNGGUHAN ke target palsu: alur gagal yang sama persis dengan aslinya
     * (backup_logs, Log Sistem, Telegram, status node) teruji tanpa menyentuh router.
     * Status node merah sampai backup asli berikutnya berhasil, itu juga menguji pesan
     * pemulihan Telegram.
     */
    public function simulate(Node $node, string $skenario, string $pemicu): BackupLog
    {
        // Salinan di memori, tidak pernah disimpan (lihat penjaga di run()).
        $palsu = clone $node;
        if ($skenario === 'login-ditolak') {
            // sshd VPS sendiri menolak user yang tidak ada → "Permission denied" asli.
            $palsu->host = '127.0.0.1';
            $palsu->port = 22;
            $palsu->ssh_user = 'simulasi-perwira';
        } else {
            // TEST-NET-1 (RFC 5737) tidak pernah dirutekan → timeout seperti router mati.
            $palsu->host = '192.0.2.1';
        }
        // Password router asli tidak boleh ikut terkirim ke target palsu.
        $palsu->ssh_password = null;

        // Cooldown dibersihkan sebelum (agar notifikasi uji pasti terkirim) dan sesudah
        // (agar gangguan asli berikutnya tidak tertahan oleh cooldown dari simulasi).
        Cache::forget("telegram_cooldown_{$node->id}");
        try {
            return $this->run($palsu, $pemicu, simulasi: true);
        } finally {
            Cache::forget("telegram_cooldown_{$node->id}");
        }
    }

    private function cleanOldBackups(Node $node): void
    {
        $retentionDays = config('backup.retention_days', 7);
        $cutoff = now()->subDays($retentionDays)->timestamp;
        $basePath = config('backup.storage_path');

        // basename(): fungsi ini unlink() isi direktori, nama node yang mengandung
        // '..' akan menghapus berkas di luar direktori backup.
        $safeName = basename($node->name);

        $dirs = [
            "{$basePath}/mikrotik/{$safeName}",
            "{$basePath}/database/{$safeName}",
            "{$basePath}/virtualizor/{$safeName}",
        ];

        $dihapus = [];
        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }
            foreach (glob("{$dir}/*") as $file) {
                if (is_file($file) && filemtime($file) < $cutoff) {
                    unlink($file);
                    BackupLog::where('file_path', $file)->delete();
                    $dihapus[] = basename($file);
                }
            }
        }

        if ($dihapus) {
            ActivityLog::info('backup', 'retensi', 'Retensi ' . count($dihapus) . " berkas backup lama {$node->name} dihapus (lebih tua dari {$retentionDays} hari).",
                ['berkas' => $dihapus], $node);
        }
    }
}
