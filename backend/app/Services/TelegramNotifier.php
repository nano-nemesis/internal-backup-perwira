<?php

namespace App\Services;

use App\Models\BackupLog;
use App\Models\Node;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramNotifier
{
    private ?string $botToken;
    private ?string $chatId;

    public function __construct()
    {
        $this->botToken = config('backup.telegram.bot_token');
        $this->chatId = config('backup.telegram.chat_id');
    }

    public function notifySuccess(Node $node, BackupLog $log): void
    {
        $size = $log->file_size_formatted;
        $duration = $log->duration_seconds ?? 0;

        $message = "✅ *Backup Berhasil*\n\n"
            . "📦 Node: `{$node->name}`\n"
            . "🔧 Tipe: `{$node->type}`\n"
            . "📁 Ukuran: `{$size}`\n"
            . "⏱ Durasi: `{$duration}s`\n"
            . "🕐 Waktu: `" . now()->format('Y-m-d H:i:s') . "`";

        $prevFailKey = "backup_failed_{$node->id}";
        if (Cache::has($prevFailKey)) {
            Cache::forget($prevFailKey);
            $message .= "\n\n🔄 *Recovery: Node ini sebelumnya gagal dan kini kembali berhasil.*";
        }

        $this->send($message);
    }

    public function notifyFailure(Node $node, string $error): void
    {
        $cooldownKey = "telegram_cooldown_{$node->id}";
        if (Cache::has($cooldownKey)) {
            return;
        }

        $cooldownMinutes = config('backup.alert_cooldown_minutes', 30);
        Cache::put($cooldownKey, true, now()->addMinutes($cooldownMinutes));
        Cache::put("backup_failed_{$node->id}", true, now()->addDays(7));

        $shortError = mb_substr($error, 0, 300);
        $message = "❌ *Backup Gagal*\n\n"
            . "📦 Node: `{$node->name}`\n"
            . "🔧 Tipe: `{$node->type}`\n"
            . "💥 Error: `{$shortError}`\n"
            . "🕐 Waktu: `" . now()->format('Y-m-d H:i:s') . "`";

        $this->send($message);
    }

    private function send(string $message): void
    {
        if (!$this->botToken || !$this->chatId) {
            Log::info("Telegram: not configured, skipping notification");
            return;
        }

        try {
            Http::timeout(10)->post(
                "https://api.telegram.org/bot{$this->botToken}/sendMessage",
                [
                    'chat_id' => $this->chatId,
                    'text' => $message,
                    'parse_mode' => 'Markdown',
                ]
            );
        } catch (\Exception $e) {
            Log::error("Telegram notification failed: " . $e->getMessage());
        }
    }
}
