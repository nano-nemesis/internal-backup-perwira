<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Pengaturan bot Telegram lewat UI, menimpa nilai .env.
 *
 * Token bot TIDAK PERNAH dikirim balik ke browser — hanya petunjuk bertopeng.
 * Token adalah kredensial penuh atas bot itu; mengirimkannya ke halaman admin
 * berarti ia ikut tersimpan di riwayat jaringan dan cache peramban.
 */
class TelegramSettingsController extends Controller
{
    public const KEY_TOKEN = 'telegram.bot_token';
    public const KEY_CHAT  = 'telegram.chat_id';

    public function show(): JsonResponse
    {
        $token = Setting::get(self::KEY_TOKEN, config('backup.telegram.bot_token'));
        $chat  = Setting::get(self::KEY_CHAT, config('backup.telegram.chat_id'));

        return response()->json([
            'data' => [
                'token_terisi' => (bool) $token,
                'token_petunjuk' => $token ? $this->mask((string) $token) : null,
                'token_dari_env' => (bool) (! Setting::get(self::KEY_TOKEN) && config('backup.telegram.bot_token')),
                'chat_id' => $chat ? (string) $chat : '',
                'siap' => (bool) ($token && $chat),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $v = $request->validate([
            // Kosongkan artinya "jangan ubah"; kirim null eksplisit untuk menghapus.
            'bot_token' => 'nullable|string|max:255',
            'chat_id'   => 'nullable|string|max:64|regex:/^-?\d+$/',
            'hapus_token' => 'boolean',
        ], [
            'chat_id.regex' => 'Chat ID harus berupa angka (boleh diawali tanda minus untuk grup).',
        ]);

        if ($request->boolean('hapus_token')) {
            Setting::forget(self::KEY_TOKEN);
        } elseif (! empty($v['bot_token'])) {
            Setting::put(self::KEY_TOKEN, $v['bot_token'], encrypt: true);
        }

        if (array_key_exists('chat_id', $v)) {
            Setting::put(self::KEY_CHAT, $v['chat_id'] ?: null);
        }

        return $this->show();
    }

    /** Kirim pesan uji supaya tidak perlu menunggu backup berikutnya untuk tahu ini benar. */
    public function test(): JsonResponse
    {
        $token = Setting::get(self::KEY_TOKEN, config('backup.telegram.bot_token'));
        $chat  = Setting::get(self::KEY_CHAT, config('backup.telegram.chat_id'));

        if (! $token || ! $chat) {
            return response()->json(['message' => 'Token bot dan Chat ID harus diisi dulu.'], 422);
        }

        try {
            $res = Http::timeout(15)->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id' => $chat,
                'text' => "✅ *Pesan uji PerwiraBackup*\n\nBot terhubung dengan benar. "
                        . "Kirim /status untuk mencoba perintahnya.",
                'parse_mode' => 'Markdown',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Gagal menghubungi Telegram: ' . $e->getMessage()], 502);
        }

        if ($res->successful()) {
            return response()->json(['message' => 'Pesan uji terkirim — cek grup Telegram Anda.']);
        }

        // Teruskan alasan dari Telegram apa adanya; itu yang paling menjelaskan.
        return response()->json([
            'message' => 'Telegram menolak: ' . ($res->json('description') ?? 'HTTP ' . $res->status()),
        ], 422);
    }

    private function mask(string $token): string
    {
        return mb_strlen($token) <= 12
            ? str_repeat('•', mb_strlen($token))
            : mb_substr($token, 0, 6) . str_repeat('•', 8) . mb_substr($token, -4);
    }
}
