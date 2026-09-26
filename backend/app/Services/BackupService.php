<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\BackupLog;
use App\Models\Node;
use App\Support\BackupErrorSummary;
use Illuminate\Support\Facades\Log;

class BackupService
{
    public function __construct(
        private MikrotikService $mikrotik,
        private DatabaseBackupService $database,
        private TelegramNotifier $telegram,
        private VirtualizorBackupService $virtualizor,
    ) {}

    public function run(Node $node, ?string $pemicu = null): BackupLog
    {
        $cara = $pemicu ? "manual oleh {$pemicu}" : 'terjadwal';
        ActivityLog::info('backup', 'backup.mulai', "Backup {$node->name} ({$node->type}, {$node->host}) dimulai — {$cara}.", [
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

        try {
            $filePath = match ($node->type) {
                'mikrotik'       => $this->mikrotik->backup($node),
                'database'       => $this->database->backup($node),
                'virtualizor_db' => $this->virtualizor->backup($node),
                default          => throw new \RuntimeException("Unknown node type: {$node->type}"),
            };

            $duration = (int) (microtime(true) - $startTime);
            $fileSize = file_exists($filePath) ? filesize($filePath) : 0;

            $log->update([
                'status' => 'success',
                'file_path' => $filePath,
                'file_size' => $fileSize,
                'duration_seconds' => $duration,
                'finished_at' => now(),
            ]);

            $node->update(['last_backup_at' => now()]);

            ActivityLog::info('backup', 'backup.berhasil',
                "Backup {$node->name} berhasil: " . basename($filePath) . ' (' . $log->fresh()->file_size_formatted . ", {$duration} detik).",
                ['file' => basename($filePath), 'ukuran_byte' => $fileSize, 'durasi_detik' => $duration, 'pemicu' => $pemicu ?? 'jadwal'],
                $node,
            );

            $this->telegram->notifySuccess($node, $log->fresh());
            $this->cleanOldBackups($node);

        } catch (\Exception $e) {
            $duration = (int) (microtime(true) - $startTime);

            $log->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'duration_seconds' => $duration,
                'finished_at' => now(),
            ]);

            // Pesan dibuka dengan SEBAB yang bisa ditindaklanjuti; error mentah tetap
            // disimpan utuh di konteks untuk penelusuran.
            $sebab = BackupErrorSummary::sebab($e->getMessage());
            ActivityLog::error('backup', 'backup.gagal',
                "Backup {$node->name} ({$node->host}) gagal setelah {$duration} detik. "
                . ($sebab ? "Kemungkinan sebab: {$sebab}." : 'Sebab tidak dikenali otomatis — lihat error mentah di detail.'),
                ['error' => $e->getMessage(), 'sebab' => $sebab, 'durasi_detik' => $duration, 'pemicu' => $pemicu ?? 'jadwal'],
                $node,
            );
            $this->telegram->notifyFailure($node, $e->getMessage());
        }

        return $log->fresh();
    }

    private function cleanOldBackups(Node $node): void
    {
        $retentionDays = config('backup.retention_days', 7);
        $cutoff = now()->subDays($retentionDays)->timestamp;
        $basePath = config('backup.storage_path');

        // basename(): fungsi ini unlink() isi direktori — nama node yang mengandung
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
