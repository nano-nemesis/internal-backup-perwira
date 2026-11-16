<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Node;
use App\Support\LaporanBackup;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Laporan backup per rentang waktu: berapa perangkat yang berhasil, berapa yang gagal, dan sebabnya.
 *
 * Sumbernya Log Sistem (activity_logs), BUKAN backup_logs: retensi berkas (7 hari) ikut
 * menghapus baris backup_logs yang berhasil, sementara yang gagal tanpa berkas tetap ada,
 * jadi rentang lebih dari seminggu akan tampak jauh lebih buruk dari kenyataannya.
 * activity_logs menyimpan semua hasil selama ACTIVITY_LOG_RETENTION_DAYS (90 hari).
 */
class LaporanBackupController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'dari'   => 'required|date_format:Y-m-d',
            'sampai' => 'required|date_format:Y-m-d|after_or_equal:dari',
        ]);
        // Tanggal dari UI = tanggal WIB, sama dengan zona waktu aplikasi: jangan dikonversi ke UTC.
        $rentang = [Carbon::parse($v['dari'])->startOfDay(), Carbon::parse($v['sampai'])->endOfDay()];
        $basis = fn () => ActivityLog::where('kategori', 'backup')->whereBetween('created_at', $rentang);

        $berhasil = $basis()->where('aksi', 'backup.berhasil')->whereNotNull('node_id')
            ->selectRaw('node_id, max(node_name) as nama, count(*) as n, max(created_at) as terakhir')
            ->groupBy('node_id')->get()
            ->mapWithKeys(fn ($r) => [$r->node_id => [
                'n' => (int) $r->n, 'nama' => $r->nama, 'terakhir' => Carbon::parse($r->terakhir)->toIso8601String(),
            ]])->all();

        $kegagalan = $basis()->whereIn('aksi', ['backup.gagal', 'backup.crash'])
            ->get(['node_id', 'node_name', 'aksi', 'konteks', 'created_at'])
            ->map(fn (ActivityLog $l) => [
                'node_id' => $l->node_id,
                'node_name' => $l->node_name,
                'aksi' => $l->aksi,
                'error' => $l->konteks['error'] ?? null,
                'sebab' => $l->konteks['sebab'] ?? null,
                'waktu' => $l->created_at->toIso8601String(),
            ])->all();

        $nodes = Node::get(['id', 'name', 'type', 'host', 'is_active', 'last_backup_at'])
            ->map(fn (Node $n) => [
                'id' => $n->id, 'nama' => $n->name, 'tipe' => $n->type, 'host' => $n->host,
                'aktif' => (bool) $n->is_active, 'backup_terakhir' => $n->last_backup_at?->toIso8601String(),
            ])->all();

        return response()->json(LaporanBackup::rangkum($nodes, $berhasil, $kegagalan) + [
            'rentang' => ['dari' => $v['dari'], 'sampai' => $v['sampai']],
            'retensi_hari' => (int) config('backup.activity_log_retention_days', 90),
        ]);
    }
}
