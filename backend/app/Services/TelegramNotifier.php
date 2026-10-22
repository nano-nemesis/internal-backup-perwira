<?php

namespace App\Services;

use App\Models\BackupLog;
use App\Models\Setting;
use App\Support\BackupErrorSummary;
use App\Models\Node;
use Illuminate\Support\Facades\Cache;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramNotifier
{
    /** Jenis notifikasi yang bisa dimatikan dari menu Bot Telegram. Semua aktif kalau belum pernah diatur. */
    public const JENIS = ['gagal', 'pulih', 'doctor', 'sukses'];

    public static function aktif(string $jenis): bool
    {
        return Setting::get("telegram.notif_{$jenis}", '1') !== '0';
    }

    /** Jeda antar-notifikasi gagal untuk node yang sama. */
    public static function jedaMenit(): int
    {
        return (int) Setting::get('telegram.jeda_menit', config('backup.alert_cooldown_minutes', 30));
    }

    private ?string $botToken;
    private ?string $chatId;

    public function __construct()
    {
        // Setting (bisa diubah lewat UI) menimpa .env; .env tetap jadi cadangan.
        $this->botToken = Setting::get('telegram.bot_token', config('backup.telegram.bot_token'));
        $this->chatId = Setting::get('telegram.chat_id', config('backup.telegram.chat_id'));
    }

    /**
     * Hasil kiriman dicatat di Log Sistem (konteks "telegram"): terkirim, dimatikan, jeda,
     * belum-diatur, atau gagal. Dipakai jejak simulasi untuk menunjukkan apa yang benar terjadi.
     */
    public function notifySuccess(Node $node, BackupLog $log): ?string
    {
        $prevFailKey = "backup_failed_{$node->id}";
        $pulih = Cache::has($prevFailKey);
        Cache::forget($prevFailKey);

        if (! self::aktif('sukses')) {
            // Pesan sukses dimatikan (grup jadi sepi), tapi kabar pulih setelah gagal tetap penting.
            if (! $pulih) {
                return null;
            }
            if (self::aktif('pulih')) {
                return $this->send("🔄 *Node pulih*\n\n"
                    . "📦 Node: `{$node->name}` · {$node->type}\n"
                    . "Backup kembali berhasil setelah sebelumnya gagal.\n"
                    . "🕐 " . now(config('backup.timezone', 'Asia/Jakarta'))->format('d M Y H:i') . " WIB");
            }
            return 'dimatikan';
        }

        $size = $log->file_size_formatted;
        $duration = $log->duration_seconds ?? 0;

        $message = "✅ *Backup Berhasil*\n\n"
            . "📦 Node: `{$node->name}`\n"
            . "🔧 Tipe: `{$node->type}`\n"
            . "📁 Ukuran: `{$size}`\n"
            . "⏱ Durasi: `{$duration}s`\n"
            . "🕐 Waktu: `" . now()->format('Y-m-d H:i:s') . "`";

        if ($pulih && self::aktif('pulih')) {
            $message .= "\n\n🔄 *Recovery: Node ini sebelumnya gagal dan kini kembali berhasil.*";
        }

        return $this->send($message);
    }

    public function notifyFailure(Node $node, string $error): string
    {
        $cooldownKey = "telegram_cooldown_{$node->id}";
        if (Cache::has($cooldownKey)) {
            return 'jeda';
        }

        // Penanda gagal tetap dipasang walau notifikasi gagal dimatikan: pesan pulih butuh itu.
        Cache::put("backup_failed_{$node->id}", true, now()->addDays(7));
        if (! self::aktif('gagal')) {
            return 'dimatikan';
        }
        Cache::put($cooldownKey, true, now()->addMinutes(self::jedaMenit()));

        $sebab = BackupErrorSummary::sebab($error);
        $shortError = mb_substr(str_replace('`', "'", trim($error)), 0, 300);

        $message = "❌ *Backup Gagal*\n\n"
            . "📦 Node: `{$node->name}` · {$node->type}\n"
            . "🖥 Host: `{$node->host}`\n";

        // Sebab singkat lebih dulu; error mentah tetap ada di bawahnya untuk ditelusuri.
        if ($sebab) {
            $message .= "\n💡 *Kemungkinan sebab:*\n{$sebab}\n";
        }

        $message .= "\n💥 Error:\n`{$shortError}`\n";

        $message .= $node->last_backup_at
            ? "\n📅 Sukses terakhir: `" . $node->last_backup_at
                ->setTimezone(config('backup.timezone', 'Asia/Jakarta'))->format('d M Y H:i') . " WIB`"
            : "\n⚠️ Node ini *belum pernah* berhasil di-backup.";

        $message .= "\n🕐 " . now(config('backup.timezone', 'Asia/Jakarta'))->format('d M Y H:i') . " WIB"
            . "\n\n_/node " . $node->name . " untuk detail_";

        return $this->send($message);
    }

    /** @param list<array> $temuan cek yang baru menjadi kritis (RouterDoctor::kritisBaru) */
    public function notifyDoctorKritis(Node $node, array $temuan): void
    {
        if (! self::aktif('doctor')) {
            return;
        }
        // Judul dibersihkan dari karakter Markdown supaya Telegram tidak menolak pesannya.
        $daftar = implode("\n", array_map(fn ($c) => '• ' . str_replace(['*', '_', '`', '['], '', $c['masalah'] ?? $c['judul']), $temuan));

        $this->send("🩺 *Doctor: temuan kritis baru*\n\n"
            . "📦 Node: `{$node->name}`\n🖥 Host: `{$node->host}`\n\n"
            . $daftar
            . "\n\n_Perintah perbaikan ada di menu Doctor._");
    }

    /** @return string terkirim | belum-diatur | gagal */
    private function send(string $message): string
    {
        if (!$this->botToken || !$this->chatId) {
            Log::info("Telegram: not configured, skipping notification");
            return 'belum-diatur';
        }

        try {
            $res = Http::timeout(10)->post(
                "https://api.telegram.org/bot{$this->botToken}/sendMessage",
                [
                    'chat_id' => $this->chatId,
                    'text' => $message,
                    'parse_mode' => 'Markdown',
                ]
            );
            // Http tidak melempar untuk 4xx/5xx, tanpa cek ini notifikasi yang ditolak
            // Telegram (token salah, bot dikeluarkan dari grup, Markdown rusak) hilang diam-diam.
            if (! $res->successful()) {
                ActivityLog::error('sistem', 'telegram.kirim-gagal',
                    'Notifikasi Telegram ditolak: ' . ($res->json('description') ?? 'HTTP ' . $res->status()) . '. Notifikasi backup tidak sampai ke grup.',
                    ['status' => $res->status(), 'awal_pesan' => mb_substr($message, 0, 200)]);
                return 'gagal';
            }
            return 'terkirim';
        } catch (\Exception $e) {
            ActivityLog::error('sistem', 'telegram.kirim-gagal',
                'Notifikasi Telegram gagal dikirim: server tidak bisa menghubungi api.telegram.org. Notifikasi backup tidak sampai ke grup.',
                ['error' => $e->getMessage()]);
            return 'gagal';
        }
    }
}
