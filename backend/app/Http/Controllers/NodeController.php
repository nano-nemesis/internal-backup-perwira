<?php

namespace App\Http\Controllers;

use App\Jobs\BackupJob;
use App\Models\BackupLog;
use App\Models\Node;
use App\Services\MikrotikService;
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
                'last_backup_at' => $node->last_backup_at,
                'schedule' => $node->load('schedule')->schedule,
            ],
            'logs' => $logs,
            'backup_files' => $backupFiles,
        ]);
    }

    public function triggerBackup(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        if (!$node->is_active) {
            return response()->json(['message' => 'Node is not active'], 422);
        }

        BackupJob::dispatch($node->id)->onQueue('backup');

        return response()->json(['message' => "Backup job queued for node [{$node->name}]"]);
    }

    public function remoteExecute(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Remote execute is only available for MikroTik nodes'], 422);
        }

        $request->validate(['command' => 'required|string|max:500']);

        try {
            /** @var MikrotikService $mikrotik */
            $mikrotik = app(MikrotikService::class);
            $output = $mikrotik->execute($node, $request->command);
            return response()->json(['data' => ['output' => $output]]);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function downloadBackup(string $id, string $filename): BinaryFileResponse|JsonResponse
    {
        $node = Node::findOrFail($id);
        $basePath = config('backup.storage_path');
        $safeName = basename($filename);

        $paths = [
            "{$basePath}/mikrotik/{$node->name}/{$safeName}",
            "{$basePath}/database/{$node->name}/{$safeName}",
        ];

        foreach ($paths as $path) {
            if (file_exists($path)) {
                return response()->download($path);
            }
        }

        return response()->json(['message' => 'File not found'], 404);
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
