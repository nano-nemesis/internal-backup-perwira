<?php

namespace App\Models;

use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/**
 * Log aktivitas yang tampil di halaman Log Sistem.
 *
 * Pakai ActivityLog::catat() — bukan create() — supaya user, IP, dan salinan ke
 * laravel.log terisi otomatis, dan supaya gagal menulis log TIDAK PERNAH
 * menggagalkan pekerjaan yang sedang dicatat (backup tetap jalan walau DB log error).
 */
class ActivityLog extends Model
{
    use MassPrunable;

    public const UPDATED_AT = null;

    protected $fillable = [
        'level', 'kategori', 'aksi', 'pesan', 'konteks',
        'user_id', 'username', 'ip', 'node_id', 'node_name',
    ];

    protected $casts = [
        'konteks'    => 'array',
        'created_at' => 'datetime',
    ];

    /** Kunci konteks yang tidak boleh ikut tersimpan walau terlanjur dikirim pemanggil. */
    private const RAHASIA = ['password', 'ssh_password', 'db_password', 'bot_token', 'token', 'current_password'];

    public static function info(string $kategori, string $aksi, string $pesan, array $konteks = [], ?Node $node = null): void
    {
        self::catat('info', $kategori, $aksi, $pesan, $konteks, $node);
    }

    public static function warning(string $kategori, string $aksi, string $pesan, array $konteks = [], ?Node $node = null): void
    {
        self::catat('warning', $kategori, $aksi, $pesan, $konteks, $node);
    }

    public static function error(string $kategori, string $aksi, string $pesan, array $konteks = [], ?Node $node = null): void
    {
        self::catat('error', $kategori, $aksi, $pesan, $konteks, $node);
    }

    public static function catat(
        string $level,
        string $kategori,
        string $aksi,
        string $pesan,
        array $konteks = [],
        ?Node $node = null,
    ): void {
        foreach (self::RAHASIA as $k) {
            if (array_key_exists($k, $konteks)) {
                $konteks[$k] = '***';
            }
        }

        // Di queue worker / artisan tidak ada request HTTP: user & IP dibiarkan kosong
        // kecuali pemanggil menyebutkannya lewat konteks 'username'.
        $request = app()->runningInConsole() ? null : request();
        $user = $request?->user();

        $baris = [
            'level'     => $level,
            'kategori'  => $kategori,
            'aksi'      => $aksi,
            'pesan'     => mb_substr($pesan, 0, 5000),
            'konteks'   => $konteks ?: null,
            'user_id'   => $user?->id,
            'username'  => $user?->username ?? ($konteks['username'] ?? null),
            'ip'        => $request?->ip(),
            'node_id'   => $node?->id,
            'node_name' => $node?->name,
        ];

        // Salinan ke laravel.log tetap ditulis: itu satu-satunya jejak kalau DB-nya
        // sendiri yang bermasalah.
        Log::log($level, "[{$kategori}.{$aksi}] {$pesan}", array_filter([
            'user' => $baris['username'], 'ip' => $baris['ip'], 'node' => $baris['node_name'],
        ]) + $konteks);

        try {
            self::create($baris);
        } catch (\Throwable $e) {
            Log::error('Gagal menulis activity_logs: ' . $e->getMessage());
        }
    }

    /** Dipangkas otomatis oleh `model:prune` (dijadwalkan harian). */
    public function prunable()
    {
        return static::where('created_at', '<', now()->subDays(config('backup.activity_log_retention_days', 90)));
    }
}
