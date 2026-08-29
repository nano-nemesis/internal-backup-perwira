<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Node;
use App\Models\NodeSchedule;
use App\Traits\HasAlignedSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Ekspor / impor konfigurasi node sebagai JSON.
 *
 * JSON, bukan YAML: json_encode ada di inti PHP sementara YAML menuntut dependensi
 * baru (symfony/yaml) atau ekstensi php-yaml yang harus ikut dipasang di VPS —
 * tidak sepadan hanya untuk format ekspor. Frontend juga sudah berbicara JSON.
 *
 * Yang TIDAK ikut diekspor: id, last_backup_at, riwayat backup. Berkas ini adalah
 * konfigurasi target, bukan cadangan basis data.
 */
class NodeConfigController extends Controller
{
    use HasAlignedSchedule;

    private const FORMAT_VERSION = 1;

    /** Kolom yang membentuk sebuah node, tanpa kredensial. */
    private const FIELDS = [
        'name', 'type', 'host', 'port', 'ssh_user', 'ssh_key_path',
        'db_name', 'db_user', 'schedule_interval_hours', 'is_active',
    ];

    public function export(Request $request): JsonResponse
    {
        $withCredentials = $request->boolean('include_credentials');

        // Mode lengkap membagikan blob terenkripsi seluruh node sekaligus — admin saja.
        if ($withCredentials && $request->user()->role !== 'admin') {
            return response()->json([
                'message' => 'Ekspor beserta kredensial hanya untuk admin.',
            ], 403);
        }

        $nodes = Node::orderBy('name')->get()->map(function (Node $node) use ($withCredentials) {
            $row = [];
            foreach (self::FIELDS as $f) {
                $row[$f] = $node->{$f};
            }

            if ($withCredentials) {
                // Sengaja mengambil nilai MENTAH dari database: accessor model akan
                // mendekripsinya jadi teks polos, dan berkas ini tidak boleh memuat itu.
                $raw = $node->getAttributes();
                $row['ssh_password_encrypted'] = $raw['ssh_password'] ?? null;
                $row['db_password_encrypted']  = $raw['db_password'] ?? null;
            }

            return $row;
        });

        $payload = [
            'format'           => 'internal-backup-perwira/nodes',
            'version'          => self::FORMAT_VERSION,
            'exported_at'      => now()->toIso8601String(),
            'includes_credentials' => $withCredentials,
            'credentials_note' => $withCredentials
                ? 'Password tersimpan TERENKRIPSI dengan APP_KEY instalasi asal. '
                  . 'Hanya bisa dipulihkan di instalasi dengan APP_KEY yang sama.'
                : 'Berkas ini TIDAK memuat password. Isi ulang lewat UI setelah impor.',
            'nodes'            => $nodes,
        ];

        $filename = sprintf(
            'nodes-%s-%s.json',
            $withCredentials ? 'lengkap' : 'aman',
            now(config('backup.timezone', 'Asia/Jakarta'))->format('Y-m-d-H.i') . 'WIB'
        );

        return response()->json($payload, 200, [
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }

    /**
     * Impor. `dry_run` menghitung dampaknya tanpa mengubah apa pun, supaya bisa
     * ditinjau dulu sebelum menyentuh konfigurasi node produksi.
     */
    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'mode'    => 'required|in:skip,update',
            'dry_run' => 'boolean',
            'nodes'   => 'required|array|min:1|max:500',
        ]);

        $mode   = $request->input('mode');
        $dryRun = $request->boolean('dry_run');
        $rows   = $request->input('nodes');

        $existing = Node::pluck('id', 'name');   // nama => id
        $errors   = [];
        $plan     = ['create' => [], 'update' => [], 'skip' => []];
        $seen     = [];

        foreach ($rows as $i => $row) {
            if (! is_array($row)) {
                $errors[] = ['index' => $i, 'name' => null, 'errors' => ['Entri bukan objek.']];
                continue;
            }

            $name = is_string($row['name'] ?? null) ? $row['name'] : null;
            $isUpdate = $name !== null && $existing->has($name);

            // Nama unik dicek terhadap database SAMBIL mengabaikan node yang memang
            // sedang diperbarui, lalu duplikat di dalam berkas itu sendiri dicek terpisah.
            $rules = [
                'name' => [
                    'required', 'string', 'max:100',
                    'regex:/^[A-Za-z0-9][A-Za-z0-9 ._-]*\z/',
                    Rule::unique('nodes', 'name')->ignore($isUpdate ? $existing[$name] : null),
                ],
                'type'                    => 'required|in:mikrotik,database,virtualizor_db',
                'host'                    => ['required', 'string', 'max:255', 'regex:/^[a-zA-Z0-9][a-zA-Z0-9\.\-\:]*\z/'],
                'port'                    => 'nullable|integer|min:1|max:65535',
                'ssh_user'                => 'nullable|string|max:100',
                'ssh_key_path'            => 'nullable|string|max:500',
                'db_name'                 => 'nullable|string|max:100',
                'db_user'                 => 'nullable|string|max:100',
                'schedule_interval_hours' => 'nullable|integer|in:1,2,3,4,6,8,12,24',
                'is_active'               => 'nullable|boolean',
                'ssh_password_encrypted'  => 'nullable|string',
                'db_password_encrypted'   => 'nullable|string',
            ];

            $v = Validator::make($row, $rules);

            if ($name !== null && isset($seen[$name])) {
                $v->after(fn ($val) => $val->errors()->add('name', "Nama ganda di dalam berkas (baris {$seen[$name]})."));
            }

            if ($v->fails()) {
                $errors[] = ['index' => $i, 'name' => $name, 'errors' => $v->errors()->all()];
                continue;
            }

            if ($name !== null) {
                $seen[$name] = $i;
            }

            if ($isUpdate && $mode === 'skip') {
                $plan['skip'][] = $name;
                continue;
            }

            $plan[$isUpdate ? 'update' : 'create'][] = $name;
        }

        // Semua-atau-tidak sama sekali: kalau ada satu entri tidak valid, tidak ada
        // yang ditulis. Impor sebagian akan menyisakan keadaan yang sulit ditelusuri.
        if ($errors) {
            return response()->json([
                'message' => 'Berkas berisi entri yang tidak valid. Tidak ada perubahan yang diterapkan.',
                'errors'  => $errors,
                'summary' => $this->summary($plan, true),
            ], 422);
        }

        if ($dryRun) {
            return response()->json([
                'message' => 'Pratinjau — belum ada perubahan yang diterapkan.',
                'dry_run' => true,
                'summary' => $this->summary($plan, false),
                'detail'  => $plan,
            ]);
        }

        DB::transaction(function () use ($rows, $mode, $existing) {
            foreach ($rows as $row) {
                $name = $row['name'];
                $isUpdate = $existing->has($name);

                if ($isUpdate && $mode === 'skip') {
                    continue;
                }

                $attrs = [];
                foreach (self::FIELDS as $f) {
                    if (array_key_exists($f, $row)) {
                        $attrs[$f] = $row[$f];
                    }
                }
                $attrs['port'] = $attrs['port'] ?? 22;
                $attrs['schedule_interval_hours'] = $attrs['schedule_interval_hours'] ?? 24;
                $attrs['is_active'] = $attrs['is_active'] ?? true;

                $node = $isUpdate ? Node::find($existing[$name]) : new Node();
                $node->fill($attrs);

                // Blob terenkripsi ditulis LANGSUNG ke atribut supaya tidak melewati
                // mutator yang akan mengenkripsinya untuk kedua kali.
                foreach ([
                    'ssh_password' => 'ssh_password_encrypted',
                    'db_password'  => 'db_password_encrypted',
                ] as $col => $key) {
                    if (! empty($row[$key])) {
                        $node->setRawAttributes(array_merge($node->getAttributes(), [$col => $row[$key]]));
                    }
                }

                $node->save();

                NodeSchedule::updateOrCreate(
                    ['node_id' => $node->id],
                    $isUpdate
                        ? ['interval_hours' => $node->schedule_interval_hours]
                        : [
                            'interval_hours' => $node->schedule_interval_hours,
                            'next_run_at'    => $this->getFirstSlot($node->schedule_interval_hours),
                        ]
                );
            }
        });

        return response()->json([
            'message' => 'Impor selesai.',
            'summary' => $this->summary($plan, false),
        ]);
    }

    private function summary(array $plan, bool $partial): array
    {
        return [
            'create'  => count($plan['create']),
            'update'  => count($plan['update']),
            'skip'    => count($plan['skip']),
            'partial' => $partial,
        ];
    }
}
