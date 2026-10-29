<?php

namespace App\Http\Controllers;

use App\Jobs\BackupJob;
use App\Models\ActivityLog;
use App\Models\BackupLog;
use App\Models\Node;
use App\Services\MikrotikService;
use App\Support\BackupDibatalkan;
use App\Support\RestoreCheck;
use App\Support\RouterOsCommandPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class NodeController extends Controller
{
    public function index(): JsonResponse
    {
        $nodes = Node::with(['latestBackupLog', 'latestSuccessLog', 'schedule'])->get()->map(function (Node $node) {
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
                'doctor' => $node->doctor_report ? Arr::only($node->doctor_report, ['peran', 'ringkasan', 'utama', 'galat']) : null,
                'doctor_checked_at' => $node->doctor_checked_at,
                'last_backup_at' => $node->last_backup_at,
                'latest_log' => $node->latestBackupLog ? [
                    'id' => $node->latestBackupLog->id,
                    'status' => $node->latestBackupLog->status,
                    'tahap' => $node->latestBackupLog->tahap,
                    'file_size' => $node->latestBackupLog->file_size,
                    'file_size_formatted' => $node->latestBackupLog->file_size_formatted,
                    'duration_seconds' => $node->latestBackupLog->duration_seconds,
                    'created_at' => $node->latestBackupLog->created_at,
                ] : null,
                'next_run_at' => $node->schedule?->next_run_at,
                'pulih' => $this->pulih($node),
                'created_at' => $node->created_at,
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
                'tahap' => $log->tahap,
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
                'doctor_report' => $node->doctor_report,
                'doctor_checked_at' => $node->doctor_checked_at,
                'last_backup_at' => $node->last_backup_at,
                'schedule' => $node->load('schedule')->schedule,
                'pulih' => $this->pulih($node->load('latestSuccessLog')),
            ],
            'logs' => $logs,
            'simulasi_terakhir' => $node->type === 'mikrotik' ? $this->simulasiTerakhir($node) : null,
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

    /** Minta backup yang sedang berjalan berhenti; worker membaca tandanya dalam ±1 detik. */
    public function batalkanBackup(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        if ($node->type !== 'database') {
            return response()->json(['message' => 'Pembatalan baru tersedia untuk node database.'], 422);
        }

        $log = $node->backupLogs()->where('status', 'running')->latest('created_at')->first();
        if (!$log) {
            return response()->json(['message' => 'Tidak ada backup yang sedang berjalan.'], 409);
        }

        $oleh = $request->user()->username;
        // Log 'running' yang lebih tua dari batas job terlama berarti worker-nya sudah
        // mati (mis. di-restart paksa): tidak ada yang akan membaca tandanya, tutup langsung.
        if ($log->started_at?->lt(now()->subSeconds(BackupJob::TIMEOUT_SEMUA_DB + 300))) {
            $log->update(['status' => 'cancelled', 'error_message' => "Dibatalkan oleh {$oleh} (proses sudah tidak berjalan).", 'finished_at' => now()]);
            ActivityLog::info('backup', 'backup.dibatalkan', "Log backup {$node->name} yang tertinggal ditutup oleh {$oleh}.", [], $node);
            return response()->json(['message' => 'Proses backup ini sudah tidak berjalan; lognya ditutup.']);
        }

        Cache::put(BackupDibatalkan::kunci($log->id), $oleh, now()->addSeconds(BackupJob::TIMEOUT_SEMUA_DB));
        ActivityLog::info('backup', 'backup.batal', "Pembatalan backup {$node->name} diminta oleh {$oleh}.", [], $node);

        return response()->json(['message' => 'Backup dihentikan dalam beberapa detik.']);
    }

    public function remoteExecute(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Remote execute is only available for MikroTik nodes'], 422);
        }

        // Pembatas karakter di bawah TIDAK menahan injeksi shell, itu sudah ditutup
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

    /** Jalankan doctor sekarang untuk satu router (perintah baca saja). */
    public function doctor(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        if ($node->type !== 'mikrotik') {
            return response()->json(['message' => 'Doctor hanya untuk node MikroTik'], 422);
        }

        try {
            return response()->json(['data' => app(MikrotikService::class)->runDoctor($node)]);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }
    }

    /** Antrekan doctor untuk semua MikroTik aktif, berjalan berurutan di antrean backup. */
    public function doctorAll(): JsonResponse
    {
        $ids = Node::where('type', 'mikrotik')->where('is_active', true)->pluck('id');
        foreach ($ids as $nodeId) {
            dispatch(function () use ($nodeId) {
                $node = Node::find($nodeId);
                if ($node) {
                    try {
                        app(MikrotikService::class)->runDoctor($node);
                    } catch (\RuntimeException) {
                        // Galatnya sudah tersimpan di laporan node oleh runDoctor().
                    }
                }
            })->onQueue('backup');
        }
        ActivityLog::info('doctor', 'doctor.semua', "Doctor dijalankan untuk {$ids->count()} router MikroTik.", []);

        return response()->json(['message' => "Doctor diantrekan untuk {$ids->count()} router"]);
    }

    /** Simulasi restore satu berkas, hanya membaca header berkas, router tidak disentuh. */
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
            "Simulasi gangguan '{$data['skenario']}' untuk {$node->name} dimasukkan ke antrean, notifikasi Telegram akan terkirim.",
            ['skenario' => $data['skenario']], $node);

        return response()->json(['message' => 'Simulasi dimasukkan ke antrean']);
    }

    /**
     * basename() membuang komponen direktori; realpath() lalu memastikan hasilnya tetap
     * di dalam direktori backup. null = tidak ada / di luar batas.
     */
    /**
     * Lampu "Pulih": apakah backup berhasil terakhir bisa dipulihkan ke perangkat yang terpasang
     * sekarang. MikroTik dinilai RestoreCheck (baca header berkas, maks 4 KB); dump database dan
     * Virtualizor sudah diperiksa kelengkapannya saat backup, jadi berkas yang ada = siap.
     *
     * @return array{putusan: string, berkas: string}|null null = belum ada backup berhasil
     */
    private function pulih(Node $node): ?array
    {
        $log = $node->latestSuccessLog;
        if (! $log || ! is_file($log->file_path)) {
            return null;
        }
        $berkas = basename($log->file_path);
        if ($node->type !== 'mikrotik' || ! preg_match('/\.(rsc|backup)$/', $berkas)) {
            return ['putusan' => 'siap', 'berkas' => $berkas];
        }

        return ['putusan' => RestoreCheck::periksa(
            $log->file_path,
            ['version' => $node->routeros_version, 'model' => $node->routeros_model],
            ['version' => $log->routeros_version, 'model' => $log->routeros_model],
        )['putusan'], 'berkas' => $berkas];
    }

    /**
     * Jejak simulasi gangguan terakhir: backup gagal bertanda [SIMULASI], hasil kiriman Telegram
     * dan catatan Log Sistem-nya, lalu backup berhasil pertama sesudahnya (pulih).
     */
    private function simulasiTerakhir(Node $node): ?array
    {
        $sim = BackupLog::where('node_id', $node->id)->where('error_message', 'like', '[SIMULASI]%')
            ->orderByDesc('created_at')->first();
        if (! $sim) {
            return null;
        }
        $catatan = fn (string $aksi, $sejak) => ActivityLog::where('node_id', $node->id)->where('aksi', $aksi)
            ->whereBetween('created_at', [$sejak, $sejak->copy()->addMinutes(10)])->orderBy('created_at')->first();
        $gagal = $catatan('backup.gagal', $sim->created_at);
        $pulih = BackupLog::where('node_id', $node->id)->where('status', 'success')
            ->where('created_at', '>', $sim->created_at)->orderBy('created_at')->first();
        $berhasil = $pulih ? $catatan('backup.berhasil', $pulih->created_at) : null;

        return [
            'waktu' => $sim->created_at,
            'selesai' => $sim->finished_at,
            'error' => $sim->error_message,
            'log_sistem' => $gagal ? ['level' => $gagal->level, 'aksi' => $gagal->aksi] : null,
            'sebab' => $gagal?->konteks['sebab'] ?? null,
            'telegram' => $gagal?->konteks['telegram'] ?? null,
            'pulih' => $pulih ? ['waktu' => $pulih->created_at, 'telegram' => $berhasil?->konteks['telegram'] ?? null] : null,
        ];
    }

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
