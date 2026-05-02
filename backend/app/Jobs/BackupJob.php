<?php

namespace App\Jobs;

use App\Models\Node;
use App\Services\BackupService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class BackupJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

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
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("BackupJob: unexpected failure for node [{$this->nodeId}]: " . $exception->getMessage());
    }
}
