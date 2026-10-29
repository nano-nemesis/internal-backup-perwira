<?php

namespace App\Jobs;

use App\Models\ActivityLog;
use App\Models\Node;
use App\Models\NodeSchedule;
use App\Services\BackupService;
use App\Services\DatabaseBackupService;
use App\Traits\HasAlignedSchedule;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class BackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, HasAlignedSchedule;

    public int $timeout = 300;

    /**
     * Node database mode semua database (db_name '*'): ratusan dump berurutan bisa
     * makan puluhan menit. queue.php retry_after harus di atas angka ini.
     */
    public const TIMEOUT_SEMUA_DB = 3 * 3600;
    public int $tries = 1;

    /**
     * Siapa yang memicu: username untuk backup manual, null = terjadwal.
     * Properti biasa (bukan promoted readonly) supaya job lama di antrean yang
     * belum punya properti ini tetap bisa di-unserialize.
     */
    public ?string $pemicu = null;

    /** Skenario simulasi gangguan ('tak-terjangkau' | 'login-ditolak'), null = backup asli. */
    public ?string $simulasi = null;

    public function __construct(public readonly string $nodeId, ?string $pemicu = null, ?string $simulasi = null)
    {
        $this->pemicu = $pemicu;
        $this->simulasi = $simulasi;

        // Dibaca saat dispatch: batas waktu job ikut tersimpan di payload antrean.
        if (Node::whereKey($nodeId)->where('type', 'database')->where('db_name', DatabaseBackupService::SEMUA)->exists()) {
            $this->timeout = self::TIMEOUT_SEMUA_DB;
        }
    }

    public function handle(BackupService $backupService): void
    {
        $node = Node::find($this->nodeId);

        if (!$node || !$node->is_active) {
            Log::info("BackupJob: node [{$this->nodeId}] not found or inactive, skipping");
            return;
        }

        if ($this->simulasi) {
            // Jadwal tidak disentuh: simulasi bukan backup.
            $backupService->simulate($node, $this->simulasi, $this->pemicu ?? 'sistem');
            return;
        }

        Log::info("BackupJob: starting backup for node [{$node->name}]");
        $backupService->run($node, $this->pemicu);

        $this->updateSchedule();
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("BackupJob: unexpected failure for node [{$this->nodeId}]: " . $exception->getMessage());
        // Sampai di sini berarti job mati di luar try/catch BackupService, biasanya
        // melewati batas waktu job atau worker kehabisan memori.
        $node = Node::find($this->nodeId);
        ActivityLog::error('backup', 'backup.crash',
            'Job backup ' . ($node?->name ?? $this->nodeId) . ' berhenti tidak wajar (bukan gagal biasa): '
            . $exception->getMessage() . ". Biasanya karena melewati batas waktu {$this->timeout} detik atau worker kehabisan memori.",
            ['exception' => get_class($exception), 'error' => $exception->getMessage()],
            $node,
        );
        $this->updateSchedule();
    }

    private function updateSchedule(): void
    {
        $schedule = NodeSchedule::where('node_id', $this->nodeId)->first();
        if (!$schedule) return;

        $nextRun = $this->getNextAlignedSlot($schedule->interval_hours);

        // Hanya update kalau next_run_at yang ada lebih dekat dari yang baru dihitung
        // Ini mencegah BackupJob menimpa jadwal yang sudah di-set scheduler
        if (!$schedule->next_run_at || $schedule->next_run_at->isBefore($nextRun)) {
            $schedule->update([
                'last_run_at' => now(),
                'next_run_at' => $nextRun,
            ]);
        } else {
            // Hanya update last_run_at saja
            $schedule->update(['last_run_at' => now()]);
        }
    }
}
