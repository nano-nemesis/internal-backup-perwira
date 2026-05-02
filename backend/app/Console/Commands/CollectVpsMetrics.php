<?php

namespace App\Console\Commands;

use App\Models\VpsMetric;
use App\Services\VpsMetricsService;
use Illuminate\Console\Command;

class CollectVpsMetrics extends Command
{
    protected $signature = 'metrics:collect';
    protected $description = 'Collect and store a VPS metrics snapshot';

    public function handle(VpsMetricsService $service): int
    {
        $service->collect();
        $this->info('VPS metrics collected');

        // Prune metrics older than 24 hours
        VpsMetric::where('recorded_at', '<', now()->subDay())->delete();

        return Command::SUCCESS;
    }
}
