<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BackupLog;
use App\Models\Node;
use App\Models\NodeSchedule;
use App\Traits\HasAlignedSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class NodeController extends Controller
{
    use HasAlignedSchedule;

    // Valid backup intervals aligned to midnight-anchored slots
    private const VALID_INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24];

    /** Dipakai kalau klien tidak menyebut interval; sama dengan default kolomnya. */
    private const INTERVAL_DEFAULT = 24;

    private function hostRules(): array
    {
        // Allow IPv4, IPv6, and valid hostnames; block shell metacharacters
        return ['required', 'string', 'max:255', 'regex:/^[a-zA-Z0-9][a-zA-Z0-9\.\-\:]*\\z/'];
    }

    /**
     * Nama node dipakai sebagai nama direktori di storage/app/backups/<tipe>/<nama>.
     *
     * Dua alasan aturan ini ketat:
     * 1. Tanpa pembatasan karakter, nama seperti '../../..' menulis (dan menghapus,
     *    lewat cleanOldBackups) di luar direktori backup.
     * 2. Tanpa keunikan, dua node berbagi satu direktori: berkasnya tercampur,
     *    Node::all()->keyBy('name') di BackupFilesController membuat berkas terhubung
     *    ke node yang salah, dan retensi node A ikut menghapus berkas node B —
     *    berujung memulihkan konfigurasi router yang keliru.
     */
    private function nameRules(?string $ignoreId = null): array
    {
        return [
            'required', 'string', 'max:100',
            'regex:/^[A-Za-z0-9][A-Za-z0-9 ._-]*\\z/',
            Rule::unique('nodes', 'name')->ignore($ignoreId),
        ];
    }

    private function sshKeyPathRules(): array
    {
        return [
            'nullable', 'string', 'max:500',
            function (string $attribute, mixed $value, \Closure $fail): void {
                if ($value && (str_contains($value, '..') || str_contains($value, "\0"))) {
                    $fail('The SSH key path contains invalid characters.');
                }
            },
        ];
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Node::with('schedule')->get()->map(fn (Node $n) => [
                'id' => $n->id,
                'name' => $n->name,
                'type' => $n->type,
                'host' => $n->host,
                'port' => $n->port,
                'ssh_user' => $n->ssh_user,
                'ssh_key_path' => $n->ssh_key_path,
                'db_name' => $n->db_name,
                'db_user' => $n->db_user,
                'schedule_interval_hours' => $n->schedule_interval_hours,
                'is_active' => $n->is_active,
                'last_backup_at' => $n->last_backup_at,
                'schedule' => $n->schedule,
                'created_at' => $n->created_at,
            ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                    => $this->nameRules(),
            'type'                    => 'required|in:mikrotik,database,virtualizor_db',
            'host'                    => $this->hostRules(),
            'port'                    => 'nullable|integer|min:1|max:65535',
            'ssh_user'                => 'nullable|string|max:100',
            'ssh_password'            => 'nullable|string',
            'ssh_key_path'            => $this->sshKeyPathRules(),
            'db_name'                 => 'nullable|string|max:100',
            'db_user'                 => 'nullable|string|max:100',
            'db_password'             => 'nullable|string',
            'schedule_interval_hours' => 'nullable|integer|in:' . implode(',', self::VALID_INTERVALS),
        ]);

        // Interval bersifat nullable di validasi. Tanpa nilai eksplisit di sini,
        // $node->schedule_interval_hours masih null sampai baris dibaca ulang dari
        // database — dan getNextAlignedSlot(null) melempar TypeError, sehingga node
        // terbuat tapi jadwalnya tidak dan pengguna melihat 500.
        $interval = $validated['schedule_interval_hours'] ?? self::INTERVAL_DEFAULT;
        $validated['schedule_interval_hours'] = $interval;

        $node = Node::create($validated);

        NodeSchedule::create([
            'node_id'     => $node->id,
            // Slot ter-align berikutnya menurut interval-nya (mis. interval 6 jam
            // pada 00:15 → 06:00 hari ini), bukan now()+interval — kalau tidak, node
            // baru langsung keluar dari grid jadwal yang dijanjikan README.
            'next_run_at' => $this->getNextAlignedSlot($interval),
            'interval_hours' => $interval,
        ]);

        return response()->json(['data' => $node, 'message' => 'Node created successfully'], 201);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(['data' => Node::with('schedule')->findOrFail($id)]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        $hostRules = $this->hostRules();
        $hostRules[0] = 'sometimes'; // required → sometimes for update

        $validated = $request->validate([
            'name'                    => array_replace($this->nameRules($node->id), [0 => 'sometimes']),
            'type'                    => 'sometimes|in:mikrotik,database,virtualizor_db',
            'host'                    => $hostRules,
            'port'                    => 'nullable|integer|min:1|max:65535',
            'ssh_user'                => 'nullable|string|max:100',
            'ssh_password'            => 'nullable|string',
            'ssh_key_path'            => $this->sshKeyPathRules(),
            'db_name'                 => 'nullable|string|max:100',
            'db_user'                 => 'nullable|string|max:100',
            'db_password'             => 'nullable|string',
            'schedule_interval_hours' => 'nullable|integer|in:' . implode(',', self::VALID_INTERVALS),
        ]);

        if (isset($validated['ssh_password']) && $validated['ssh_password'] === '') {
            unset($validated['ssh_password']);
        }
        if (isset($validated['db_password']) && $validated['db_password'] === '') {
            unset($validated['db_password']);
        }

        $oldName = $node->name;
        $node->update($validated);

        if ($node->name !== $oldName) {
            $this->renameBackupDirs($oldName, $node->name);
        }

        if (isset($validated['schedule_interval_hours'])) {
            // next_run_at ikut dihitung ulang: tanpa ini interval baru baru berlaku
            // setelah jadwal LAMA jalan (ubah 24→6 jam pukul 00:15 tetap menunggu
            // besok 00:00), dan pada node yang belum punya baris jadwal
            // updateOrCreate membuatnya dengan next_run_at NULL — scheduler melewati
            // baris itu selamanya sehingga node tidak pernah dibackup.
            NodeSchedule::updateOrCreate(
                ['node_id' => $node->id],
                [
                    'interval_hours' => $validated['schedule_interval_hours'],
                    'next_run_at'    => $this->getNextAlignedSlot($validated['schedule_interval_hours']),
                ]
            );
        }

        return response()->json(['data' => $node, 'message' => 'Node updated successfully']);
    }

    /**
     * Ikut pindahkan direktori backup saat node diganti nama.
     *
     * Tanpa ini, berkas lama tertinggal di direktori nama lama: retensi tidak pernah
     * memangkasnya (retensi hanya menyapu direktori nama SEKARANG), file browser
     * menampilkannya dengan node_id null karena tidak ada node bernama itu lagi, dan
     * halaman detail node kehilangan seluruh riwayatnya.
     *
     * Catatan: kolom file_path di backup_logs tetap menunjuk path lama. Itu hanya
     * dipakai untuk mencocokkan baris saat retensi menghapus berkas, dan UI cuma
     * menampilkan basename-nya — jadi dampaknya baris log lama tidak ikut terhapus,
     * bukan berkas yang hilang.
     */
    private function renameBackupDirs(string $from, string $to): void
    {
        $base = config('backup.storage_path');

        foreach (['mikrotik', 'database', 'virtualizor'] as $type) {
            $src = $base . '/' . $type . '/' . basename($from);
            $dst = $base . '/' . $type . '/' . basename($to);

            if (!is_dir($src) || is_dir($dst)) {
                continue;
            }

            if (!@rename($src, $dst)) {
                Log::warning(
                    "Gagal memindahkan direktori backup [{$src}] ke [{$dst}] saat node "
                    . "diganti nama. Berkas lama masih ada, tapi tidak lagi terhubung ke node."
                );
            }
        }
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $node = Node::findOrFail($id);

        Log::warning('AUDIT hapus-node', [
            'user' => $request->user()->username, 'ip' => $request->ip(), 'node' => $node->name,
        ]);

        $node->delete();
        return response()->json(['message' => 'Node deleted successfully']);
    }

    public function toggle(string $id): JsonResponse
    {
        $node = Node::findOrFail($id);
        $node->update(['is_active' => !$node->is_active]);
        $status = $node->is_active ? 'activated' : 'deactivated';
        return response()->json(['data' => $node, 'message' => "Node {$status}"]);
    }

    public function bulkDestroy(Request $request): JsonResponse
    {
        $request->validate([
            'ids'   => 'required|array|min:1',
            'ids.*' => 'required|uuid|exists:nodes,id',
        ]);

        $count = Node::whereIn('id', $request->ids)->count();

        Log::warning('AUDIT hapus-node-massal', [
            'user' => $request->user()->username, 'ip' => $request->ip(), 'jumlah' => $count,
        ]);

        NodeSchedule::whereIn('node_id', $request->ids)->delete();
        BackupLog::whereIn('node_id', $request->ids)->delete();
        Node::whereIn('id', $request->ids)->delete();

        return response()->json([
            'message'       => "{$count} node berhasil dihapus.",
            'deleted_count' => $count,
        ]);
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $count = Node::count();

        Log::warning('AUDIT hapus-semua-node', [
            'user' => $request->user()->username, 'ip' => $request->ip(), 'jumlah' => $count,
        ]);

        // delete(), BUKAN truncate(): MySQL menolak TRUNCATE pada tabel yang
        // direferensikan foreign key (error 1701) — backup_logs dan node_schedules
        // menunjuk ke nodes, jadi endpoint ini SELALU gagal 500 sebelumnya.
        // FK-nya onDelete('cascade'), sehingga baris anak ikut terhapus sendiri.
        Node::query()->delete();

        return response()->json([
            'message'       => "Semua {$count} node berhasil dihapus.",
            'deleted_count' => $count,
        ]);
    }
}
