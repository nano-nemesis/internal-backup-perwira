<?php

/**
 * PATCH: BackupService.php
 *
 * Tambahkan VirtualizorBackupService ke constructor injection
 * dan tambahkan case 'virtualizor_db' di match statement.
 *
 * File: backend/app/Services/BackupService.php
 * Perubahan: MINIMAL — hanya 2 baris tambahan.
 */

namespace App\Services;

use App\Models\BackupLog;
use App\Models\Node;
use App\Models\NodeSchedule;
use Illuminate\Support\Facades\Log;

class BackupService
{
    public function __construct(
        private MikrotikService $mikrotik,
        private DatabaseBackupService $database,
        private TelegramNotifier $telegram,
        private VirtualizorBackupService $virtualizor,  // <-- TAMBAH INI
    ) {}

    public function run(Node $node): BackupLog
    {
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
                'virtualizor_db' => $this->virtualizor->backup($node),  // <-- TAMBAH INI
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

            Log::error("Backup failed for node [{$node->name}]: " . $e->getMessage());
            $this->telegram->notifyFailure($node, $e->getMessage());
        }

        $this->updateSchedule($node);

        return $log->fresh();
    }

    private function updateSchedule(Node $node): void
    {
        NodeSchedule::updateOrCreate(
            ['node_id' => $node->id],
            [
                'last_run_at' => now(),
                'next_run_at' => now()->addHours($node->schedule_interval_hours),
                'interval_hours' => $node->schedule_interval_hours,
            ]
        );
    }

    private function cleanOldBackups(Node $node): void
    {
        $retentionDays = config('backup.retention_days', 7);
        $cutoff = now()->subDays($retentionDays)->timestamp;
        $basePath = config('backup.storage_path');

        $dirs = [
            "{$basePath}/mikrotik/{$node->name}",
            "{$basePath}/database/{$node->name}",
            "{$basePath}/virtualizor/{$node->name}",  // <-- TAMBAH INI
        ];

        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }
            foreach (glob("{$dir}/*") as $file) {
                if (is_file($file) && filemtime($file) < $cutoff) {
                    unlink($file);
                    BackupLog::where('file_path', $file)->delete();
                }
            }
        }
    }
}
