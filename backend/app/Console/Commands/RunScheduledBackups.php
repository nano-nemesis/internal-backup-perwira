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

            // Node baru — buat jadwal pertama kali, jangan dispatch langsung
            if (!$schedule) {
                $nextRun = $this->getFirstSlot($node->schedule_interval_hours);
                NodeSchedule::create([
                    'node_id'        => $node->id,
                    'next_run_at'    => $nextRun,
                    'last_run_at'    => null,
                    'interval_hours' => $node->schedule_interval_hours,
                ]);
                Log::info("RunScheduledBackups: node [{$node->name}] dijadwalkan pertama kali → {$nextRun->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')} WIB");
                continue;
            }

            // Belum waktunya backup
            if (!$schedule->next_run_at || !$schedule->next_run_at->isPast()) {
                continue;
            }

            // PENTING: Update next_run_at SEBELUM dispatch
            // Ini mencegah scheduler dispatch ulang di menit berikutnya
            // walaupun BackupJob belum selesai
            $nextRun = $this->getNextAlignedSlot($schedule->interval_hours);
            $schedule->update([
                'last_run_at' => now(),
                'next_run_at' => $nextRun,
            ]);

            BackupJob::dispatch($node->id)->onQueue('backup');
            $dispatched++;

            Log::info("RunScheduledBackups: dispatched [{$node->name}], next run → {$nextRun->setTimezone('Asia/Jakarta')->format('Y-m-d H:i')} WIB");
        }

        $this->info("Dispatched {$dispatched} backup job(s)");
        return Command::SUCCESS;
    }
}
