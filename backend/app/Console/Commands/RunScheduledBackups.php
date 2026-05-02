<?php

namespace App\Console\Commands;

use App\Jobs\BackupJob;
use App\Models\Node;
use App\Models\NodeSchedule;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RunScheduledBackups extends Command
{
    protected $signature = 'backup:run-scheduled';
    protected $description = 'Dispatch backup jobs for nodes that are due';

    public function handle(): int
    {
        $nodes = Node::where('is_active', true)->get();
        $dispatched = 0;

        foreach ($nodes as $node) {
            $schedule = NodeSchedule::where('node_id', $node->id)->first();

            if (!$schedule) {
                // First run: create schedule and dispatch immediately
                NodeSchedule::create([
                    'node_id' => $node->id,
                    'next_run_at' => now(),
                    'last_run_at' => null,
                    'interval_hours' => $node->schedule_interval_hours,
                ]);
                BackupJob::dispatch($node->id)->onQueue('backup');
                $dispatched++;
                Log::info("RunScheduledBackups: first-run dispatch for node [{$node->name}]");
                continue;
            }

            if ($schedule->next_run_at && $schedule->next_run_at->isPast()) {
                BackupJob::dispatch($node->id)->onQueue('backup');
                $dispatched++;
                Log::info("RunScheduledBackups: dispatched backup for node [{$node->name}]");
            }
        }

        $this->info("Dispatched {$dispatched} backup job(s)");
        return Command::SUCCESS;
    }
}
