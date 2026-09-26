<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'level'    => 'nullable|in:info,warning,error',
            'kategori' => 'nullable|string|max:20',
            'node_id'  => 'nullable|uuid',
            'q'        => 'nullable|string|max:100',
            'dari'     => 'nullable|date',
            'sampai'   => 'nullable|date',
            'per_page' => 'nullable|integer|min:10|max:200',
        ]);

        $q = ActivityLog::query()->orderByDesc('id');

        foreach (['level', 'kategori', 'node_id'] as $f) {
            if (! empty($v[$f])) {
                $q->where($f, $v[$f]);
            }
        }
        if (! empty($v['q'])) {
            $cari = '%' . addcslashes($v['q'], '%_\\') . '%';
            $q->where(fn ($w) => $w->where('pesan', 'like', $cari)
                ->orWhere('username', 'like', $cari)
                ->orWhere('node_name', 'like', $cari)
                ->orWhere('ip', 'like', $cari)
                ->orWhere('aksi', 'like', $cari));
        }
        // Tanggal dari UI = tanggal WIB, sama dengan zona waktu aplikasi (config/app.php).
        if (! empty($v['dari'])) {
            $q->where('created_at', '>=', \Carbon\Carbon::parse($v['dari'])->startOfDay());
        }
        if (! empty($v['sampai'])) {
            $q->where('created_at', '<=', \Carbon\Carbon::parse($v['sampai'])->endOfDay());
        }

        $page = $q->paginate($v['per_page'] ?? 50);

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
                'per_page'     => $page->perPage(),
                'total'        => $page->total(),
            ],
            // Ringkasan 24 jam terakhir untuk kartu di atas halaman.
            'ringkasan' => ActivityLog::where('created_at', '>=', now()->subDay())
                ->selectRaw('level, count(*) as jumlah')->groupBy('level')->pluck('jumlah', 'level'),
        ]);
    }
}
