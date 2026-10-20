<?php

namespace App\Http\Controllers;

use App\Jobs\BackupJob;
use App\Models\ActivityLog;
use App\Models\BackupLog;
use App\Models\Node;
use App\Services\MikrotikService;
use App\Support\RestoreCheck;
use App\Support\RouterOsCommandPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class NodeController extends Controller
{
    public function index(): JsonResponse
    {
        $nodes = Node::with(['latestBackupLog', 'schedule'])->get()->map(function (Node $node) {
            return [
                'id' => $node->id,
                'name' => $node->name,
                'type' => $node->type,
                'host' => $node->host,
                'port' => $node->port,
                'ssh_user' => $node->ssh_user,
                'ssh_key_path' => $node->ssh_key_path,
                'db_name' => $node->db_name,
                'db_user' => $node->db_user,
                'schedule_interval_hours' => $node->schedule_interval_hours,
                'is_active' => $node->is_active,
                'backup_binary' => $node->backup_binary,
                'routeros_version' => $node->routeros_version,
                'routeros_model' => $node->routeros_model,
                'routeros_checked_at' => $node->routeros_checked_at,
                'last_backup_at' => $node->last_backup_at,
                'latest_log' => $node->latestBackupLog ? [
                    'id' => $node->latestBackupLog->id,
                    'status' => $node->latestBackupLog->status,
                    'file_size' => $node->latestBackupLog->file_size,
                    'file_size_formatted' => $node->latestBackupLog->file_size_formatted,
                    'duration_seconds' => $node->latestBackupLog->duration_seconds,
                    'created_at' => $node->latestBackupLog->created_at,
                ] : null,
                'next_run_at' => $node->schedule?->next_run_at,
            ];
        });

        $latestStatuses = $nodes->pluck('latest_log.status');
        $stats = [
            'total' => $nodes->count(),
            'success' => $latestStatuses->filter(fn ($s) => $s === 'success')->count(),
            'failed' => $latestStatuses->filter(fn ($s) => $s === 'failed')->count(),
            'unknown' => $nodes->filter(fn ($n) => $n['latest_log'] === null)->count(),
        ];

        return response()->json(['data' => $nodes, 'stats' => $stats]);
    }

    public function show(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        $logs = BackupLog::where('node_id', $id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn (BackupLog $log) => [
                'id' => $log->id,
                'status' => $log->status,
                'file_path' => $log->file_path ? basename($log->file_path) : null,
                'file_size' => $log->file_size,
                'file_size_formatted' => $log->file_size_formatted,
                'duration_seconds' => $log->duration_seconds,
                'error_message' => $log->error_message,
                'routeros_version' => $log->routeros_version,
                'started_at' => $log->started_at,
                'finished_at' => $log->finished_at,
                'created_at' => $log->created_at,
            ]);

        $backupFiles = $this->getBackupFiles($node);

        return response()->json([
            'data' => [
                'id' => $node->id,
                'name' => $node->name,
                'type' => $node->type,
                'host' => $node->host,
                'port' => $node->port,
                'ssh_user' => $node->ssh_user,
                'ssh_key_path' => $node->ssh_key_path,
                'db_name' => $node->db_name,
                'db_user' => $node->db_user,
                'schedule_interval_hours' => $node->schedule_interval_hours,
                'is_active' => $node->is_active,
                'backup_binary' => $node->backup_binary,
                'routeros_version' => $node->routeros_version,
                'routeros_model' => $node->routeros_model,
                'routeros_checked_at' => $node->routeros_checked_at,
                'last_backup_at' => $node->last_backup_at,
                'schedule' => $node->load('schedule')->schedule,
            ],
            'logs' => $logs,
            'backup_files' => $backupFiles,
        ]);
    }

    public function triggerBackup(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        if (!$node->is_active) {
            return response()->json(['message' => 'Node is not active'], 422);
        }

        BackupJob::dispatch($node->id, $request->user()->username)->onQueue('backup');
        ActivityLog::info('backup', 'backup.manual', "Backup manual {$node->name} dimasukkan ke antrean.", [], $node);

        return response()->json(['message' => "Backup job queued for node [{$node->name}]"]);
    }

    public function remoteExecute(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Remote execute is only available for MikroTik nodes'], 422);
        }

        // Pembatas karakter di bawah TIDAK menahan injeksi shell — itu sudah ditutup
        // escapeshellarg() di MikrotikService. Ia cuma mempersempit permukaan input.
        $request->validate([
            'command' => [
                'required', 'string', 'max:500',
                'regex:/^[a-zA-Z0-9\s\/\-\=\.\,\_\:\@\[\]\+\*\?\!\"\#\&\(\)]+$/',
            ],
        ]);

        // Kebijakan + tesnya ada di App\Support\RouterOsCommandPolicy.
        if (RouterOsCommandPolicy::isDestructive($request->command)) {
            ActivityLog::warning('terminal', 'terminal.ditolak', "Perintah terminal di {$node->name} ditolak karena mengubah konfigurasi: {$request->command}", [
                'command' => $request->command,
            ], $node);
            return response()->json([
                'message' => 'Perintah yang mengubah konfigurasi router ditolak dari terminal ini. '
                    . 'Gunakan akses langsung ke router untuk perubahan.',
            ], 422);
        }

        // Jejak audit: perintah ini menyentuh router produksi. Tanpa catatan siapa
        // yang menjalankannya, insiden tidak bisa ditelusuri.
        try {
            /** @var MikrotikService $mikrotik */
            $mikrotik = app(MikrotikService::class);
            $output = $mikrotik->execute($node, $request->command);
            ActivityLog::warning('terminal', 'terminal.jalan', "Perintah terminal di {$node->name}: {$request->command}", [
                'command' => $request->command, 'panjang_output' => strlen($output),
            ], $node);
            return response()->json(['data' => ['output' => $output]]);
        } catch (\Exception $e) {
            ActivityLog::error('terminal', 'terminal.gagal', "Perintah terminal di {$node->name} gagal: {$request->command}", [
                'command' => $request->command, 'error' => $e->getMessage(),
            ], $node);
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function downloadBackup(string $id, string $filename): BinaryFileResponse|JsonResponse
    {
        $node = Node::findOrFail($id);
        $resolved = $this->resolveBackupFile($node, $filename);
        if (!$resolved) {
            return response()->json(['message' => 'File not found'], 404);
        }

        ActivityLog::info('berkas', 'unduh', 'Berkas backup ' . basename($resolved) . ' diunduh.', ['file' => basename($resolved)], $node);
        return response()->download($resolved);
    }

    /** Baca versi + model RouterOS langsung dari router (tombol "Cek sekarang"). */
    public function deviceInfo(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Hanya untuk node MikroTik'], 422);
        }

        try {
            $info = app(MikrotikService::class)->refreshDeviceInfo($node);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }

        return response()->json(['data' => $info + ['checked_at' => $node->routeros_checked_at]]);
    }

    /** Simulasi restore satu berkas — hanya membaca header berkas, router tidak disentuh. */
    public function restoreCheck(string $id, string $filename): JsonResponse
    {
        $node = Node::findOrFail($id);
        $resolved = $this->resolveBackupFile($node, $filename);
        if (!$resolved || !preg_match('/\.(rsc|backup)$/', $resolved)) {
            return response()->json(['message' => 'Berkas backup MikroTik tidak ditemukan'], 404);
        }

        $log = BackupLog::where('file_path', $resolved)->first();

        return response()->json(['data' => RestoreCheck::periksa(
            $resolved,
            ['version' => $node->routeros_version, 'model' => $node->routeros_model],
            ['version' => $log?->routeros_version, 'model' => $log?->routeros_model],
        ) + ['dicek_pada' => $node->routeros_checked_at]]);
    }

    public function simulateFailure(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Simulasi hanya untuk node MikroTik'], 422);
        }
        $data = $request->validate(['skenario' => 'required|in:tak-terjangkau,login-ditolak']);

        BackupJob::dispatch($node->id, $request->user()->username, $data['skenario'])->onQueue('backup');
        ActivityLog::warning('backup', 'backup.simulasi',
            "Simulasi gangguan '{$data['skenario']}' untuk {$node->name} dimasukkan ke antrean — notifikasi Telegram akan terkirim.",
            ['skenario' => $data['skenario']], $node);

        return response()->json(['message' => 'Simulasi dimasukkan ke antrean']);
    }

    /**
     * basename() membuang komponen direktori; realpath() lalu memastikan hasilnya tetap
     * di dalam direktori backup. null = tidak ada / di luar batas.
     */
    private function resolveBackupFile(Node $node, string $filename): ?string
    {
        $safeName = basename($filename);
        if (str_contains($safeName, "\0")) {
            return null;
        }

        $baseDir = realpath(storage_path('app/backups'));

        foreach (['mikrotik', 'database'] as $type) {
            $resolved = realpath($baseDir . DIRECTORY_SEPARATOR . $type
                . DIRECTORY_SEPARATOR . $node->name
                . DIRECTORY_SEPARATOR . $safeName);

            if ($resolved
                && str_starts_with($resolved, $baseDir . DIRECTORY_SEPARATOR)
                && is_file($resolved)
            ) {
                return $resolved;
            }
        }

        return null;
    }

    private function getBackupFiles(Node $node): array
    {
        $basePath = config('backup.storage_path');
        $dirs = [
            "{$basePath}/mikrotik/{$node->name}",
            "{$basePath}/database/{$node->name}",
        ];

        $files = [];
        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }
            foreach ((array) glob("{$dir}/*") as $file) {
                if (!is_file($file)) {
                    continue;
                }
                $files[] = [
                    'filename' => basename($file),
                    'size' => filesize($file),
                    'modified_at' => date('Y-m-d H:i:s', filemtime($file)),
                ];
            }
        }

        usort($files, fn ($a, $b) => strcmp($b['modified_at'], $a['modified_at']));

        return $files;
    }
}
