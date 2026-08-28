<?php

namespace App\Services;

use App\Models\VpsMetric;
use Illuminate\Support\Collection;

class VpsMetricsService
{
    public function collect(): VpsMetric
    {
        $cpu = $this->getCpuUsage();
        $memory = $this->getMemoryUsage();
        $disk = $this->getDiskUsage();
        $load = sys_getloadavg()[0];

        return VpsMetric::create([
            'recorded_at' => now(),
            'cpu_usage_percent' => $cpu,
            'memory_used_mb' => $memory['used'],
            'memory_total_mb' => $memory['total'],
            'disk_used_gb' => $disk['used'],
            'disk_total_gb' => $disk['total'],
            'load_average' => $load,
        ]);
    }

    private function getCpuUsage(): float
    {
        $stat1 = $this->readProcStat();
        usleep(200000);
        $stat2 = $this->readProcStat();

        if (empty($stat1) || empty($stat2)) {
            return 0.0;
        }

        $idle1 = $stat1[3] ?? 0;
        $idle2 = $stat2[3] ?? 0;
        $total1 = array_sum($stat1);
        $total2 = array_sum($stat2);

        $totalDiff = $total2 - $total1;
        $idleDiff = $idle2 - $idle1;

        if ($totalDiff <= 0) return 0.0;

        return round((1 - $idleDiff / $totalDiff) * 100, 2);
    }

    private function readProcStat(): array
    {
        if (!file_exists('/proc/stat')) {
            return [];
        }
        $stat = file_get_contents('/proc/stat');
        $line = explode("\n", $stat)[0];
        $values = preg_split('/\s+/', trim($line));
        array_shift($values);
        return array_map('intval', $values);
    }

    private function getMemoryUsage(): array
    {
        if (!file_exists('/proc/meminfo')) {
            return ['total' => 0, 'used' => 0];
        }

        $meminfo = file_get_contents('/proc/meminfo');
        preg_match('/MemTotal:\s+(\d+)/', $meminfo, $total);
        preg_match('/MemAvailable:\s+(\d+)/', $meminfo, $available);

        $totalKb = (int) ($total[1] ?? 0);
        $availableKb = (int) ($available[1] ?? 0);
        $usedKb = $totalKb - $availableKb;

        return [
            'total' => (int) round($totalKb / 1024),
            'used' => (int) round($usedKb / 1024),
        ];
    }

    /**
     * Ukur partisi tempat backup benar-benar disimpan, bukan '/'.
     *
     * Di VPS, direktori backup lazim berada di volume terpisah yang di-mount. Mengukur
     * '/' membuat dashboard melaporkan disk lega sementara partisi backup penuh — dan
     * backup mulai gagal tanpa ada tanda apa pun di grafik.
     *
     * disk_total_space()/disk_free_space() bawaan PHP menggantikan shell_exec + parsing
     * keluaran `df`: tidak butuh proses eksternal dan tidak bergantung format `df`.
     */
    private function getDiskUsage(): array
    {
        $path = config('backup.storage_path');
        if (!is_dir($path)) {
            $path = storage_path();   // direktori backup dibuat saat backup pertama
        }

        $total = @disk_total_space($path);
        $free = @disk_free_space($path);

        if ($total === false || $free === false || $total <= 0) {
            return ['used' => 0, 'total' => 0];
        }

        $gb = 1024 ** 3;
        return [
            'total' => round($total / $gb, 2),
            'used' => round(($total - $free) / $gb, 2),
        ];
    }

    public function getLastHour(): Collection
    {
        return VpsMetric::where('recorded_at', '>=', now()->subHour())
            ->orderBy('recorded_at')
            ->get();
    }

    public function getLatest(): ?VpsMetric
    {
        return VpsMetric::latest('recorded_at')->first();
    }
}
