<?php

namespace App\Console\Commands;

use App\Jobs\BackupJob;
use App\Models\Node;
use App\Models\NodeSchedule;
use App\Traits\HasAlignedSchedule;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RunScheduledBackups extends Command
{
    use HasAlignedSchedule;

    protected $signature = 'backup:run-scheduled';
    protected $description = 'Dispatch backup jobs for nodes that are due';

    public function handle(): int
    {
        $nodes = Node::where('is_active', true)->get();
        $dispatched = 0;

        foreach ($nodes as $node) {
            $schedule = NodeSchedule::where('node_id', $node->id)->first();

            if (!$schedule) {
                NodeSchedule::create([
                    'node_id'        => $node->id,
                    'next_run_at'    => $this->getNextAlignedSlot($node->schedule_interval_hours),
                    'last_run_at'    => null,
                    'interval_hours' => $node->schedule_interval_hours,
                ]);
                Log::info("RunScheduledBackups: first-run scheduled for node [{$node->name}]");
                continue;
            }

            if ($schedule->next_run_at && $schedule->next_run_at->isPast()) {
                BackupJob::dispatch($node->id)->onQueue('backup');
                $schedule->update([
                    'last_run_at' => now(),
                    'next_run_at' => $this->getNextAlignedSlot($schedule->interval_hours),
                ]);
                $dispatched++;
                Log::info("RunScheduledBackups: dispatched backup for node [{$node->name}]");
            }
        }

        $this->info("Dispatched {$dispatched} backup job(s)");
        return Command::SUCCESS;
    }
}
