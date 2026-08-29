<?php

namespace App\Console\Commands;

use App\Services\TelegramBot;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class TelegramListen extends Command
{
    protected $signature = 'telegram:listen
                            {--max-runtime=3600 : Keluar setelah sekian detik agar systemd memulai ulang prosesnya}';

    protected $description = 'Dengarkan perintah bot Telegram (long polling, tanpa webhook)';

    private const OFFSET_KEY = 'telegram_update_offset';

    public function handle(TelegramBot $bot): int
    {
        if (! $bot->isConfigured()) {
            $this->error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi di .env');
            return Command::FAILURE;
        }

        $offset = Cache::get(self::OFFSET_KEY);

        if ($offset === null) {
            // Jalan pertama (atau cache terhapus): lewati antrian lama supaya perintah
            // yang dikirim berjam-jam lalu tidak tiba-tiba dieksekusi sekarang.
            $offset = $bot->skipBacklog();
            Cache::forever(self::OFFSET_KEY, $offset);
            $this->info('Melewati antrian pesan lama.');
        }

        $deadline = time() + (int) $this->option('max-runtime');
        $this->info('Mendengarkan perintah Telegram…');

        while (time() < $deadline) {
            try {
                $baru = $bot->poll($offset);

                if ($baru !== $offset) {
                    $offset = $baru;
                    Cache::forever(self::OFFSET_KEY, $offset);
                }
            } catch (\Throwable $e) {
                // Jangan mati karena satu gangguan jaringan — Telegram sering
                // memutus koneksi long-poll, dan itu wajar.
                Log::warning('telegram:listen — ' . $e->getMessage());
                sleep(5);
            }
        }

        // Keluar bersih; systemd (Restart=always) menjalankannya lagi. Proses PHP
        // berumur panjang lebih baik didaur ulang berkala daripada dibiarkan abadi.
        $this->info('Batas waktu tercapai, keluar untuk didaur ulang.');

        return Command::SUCCESS;
    }
}
