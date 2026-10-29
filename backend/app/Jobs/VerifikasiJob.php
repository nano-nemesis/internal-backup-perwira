<?php

namespace App\Jobs;

use App\Models\ActivityLog;
use App\Models\HasilVerifikasi;
use App\Models\Node;
use App\Services\UjiRestoreService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/** Restore uji satu berkas dump. Antrean 'backup': tidak pernah berbarengan dengan backup. */
class VerifikasiJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $timeout = 3600;
    public int $tries = 1;

    public function __construct(public readonly string $nodeId, public readonly string $path, public readonly string $pemicu)
    {
    }

    public function handle(UjiRestoreService $uji): void
    {
        $node = Node::find($this->nodeId);
        if (!is_file($this->path)) {
            HasilVerifikasi::where('file_path', $this->path)->delete();
            return;
        }

        try {
            $hasil = $uji->uji($this->path);
        } catch (\RuntimeException $e) {
            $hasil = ['status' => 'gagal', 'ringkasan' => 'Restore uji tidak bisa dijalankan', 'database' => [],
                'galat' => $e->getMessage(), 'pada' => now()->toIso8601String()];
        }
        HasilVerifikasi::simpan($this->path, 'restore', $hasil + ['oleh' => $this->pemicu]);

        $pesan = 'Restore uji ' . basename($this->path) . ": {$hasil['ringkasan']}.";
        $hasil['status'] === 'gagal'
            ? ActivityLog::error('verifikasi', 'verifikasi.restore', $pesan, ['hasil' => $hasil], $node)
            : ActivityLog::info('verifikasi', 'verifikasi.restore', $pesan, ['hasil' => $hasil], $node);
    }

    public function failed(\Throwable $e): void
    {
        HasilVerifikasi::simpan($this->path, 'restore', ['status' => 'gagal', 'ringkasan' => 'Restore uji berhenti tidak wajar',
            'database' => [], 'galat' => $e->getMessage(), 'pada' => now()->toIso8601String(), 'oleh' => $this->pemicu]);
    }
}
