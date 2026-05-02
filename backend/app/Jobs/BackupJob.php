<?php

namespace App\Jobs;

use App\Models\Node;
use App\Models\NodeSchedule;
use App\Services\BackupService;
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
    public int $tries = 1;

    public function __construct(public readonly string $nodeId) {}

    public function handle(BackupService $backupService): void
    {
        $node = Node::find($this->nodeId);

        if (!$node || !$node->is_active) {
            Log::info("BackupJob: node [{$this->nodeId}] not found or inactive, skipping");
            return;
        }

        Log::info("BackupJob: starting backup for node [{$node->name}]");
        $backupService->run($node);

        $this->updateSchedule();
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("BackupJob: unexpected failure for node [{$this->nodeId}]: " . $exception->getMessage());
        $this->updateSchedule();
    }

    private function updateSchedule(): void
    {
        $schedule = NodeSchedule::where('node_id', $this->nodeId)->first();
        if ($schedule) {
            $schedule->update([
                'last_run_at' => now(),
                'next_run_at' => $this->getNextAlignedSlot($schedule->interval_hours),
            ]);
        }
    }
}
