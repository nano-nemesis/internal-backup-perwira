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
    protected $description = 'Dispatch backup jobs for nodes that are due (aligned to midnight WIB)';

    public function handle(): int
    {
        $nodes = Node::where('is_active', true)->get();
        $dispatched = 0;

        foreach ($nodes as $node) {
            $schedule = NodeSchedule::where('node_id', $node->id)->first();

            if (!$schedule) {
                $nextRun = $this->getNextAlignedSlot($node->schedule_interval_hours);
                NodeSchedule::create([
                    'node_id'        => $node->id,
                    'next_run_at'    => $nextRun,
                    'last_run_at'    => null,
                    'interval_hours' => $node->schedule_interval_hours,
                ]);
                Log::info("RunScheduledBackups: node [{$node->name}] dijadwalkan pertama kali → next run {$nextRun->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')} WIB");
                continue;
            }

            if ($schedule->next_run_at && $schedule->next_run_at->isPast()) {
                BackupJob::dispatch($node->id)->onQueue('backup');
                $dispatched++;

                $nextRun = $this->getNextAlignedSlot($schedule->interval_hours);
                $schedule->update([
                    'last_run_at' => now(),
                    'next_run_at' => $nextRun,
                ]);

                Log::info("RunScheduledBackups: dispatched backup untuk node [{$node->name}], next run → {$nextRun->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')} WIB");
            }
        }

        $this->info("Dispatched {$dispatched} backup job(s)");
        return Command::SUCCESS;
    }
}
