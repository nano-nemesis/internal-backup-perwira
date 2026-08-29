<?php

namespace App\Services;

use App\Models\Node;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sisi MASUK bot Telegram: menerima perintah, menjawab dengan keadaan sistem.
 * (Sisi keluar — notifikasi sukses/gagal — ada di TelegramNotifier.)
 *
 * Memakai long polling `getUpdates`, bukan webhook. Webhook Telegram mewajibkan
 * HTTPS dengan sertifikat sah, sementara aplikasi ini diakses lewat http://IP
 * tanpa domain. Long polling tidak butuh port terbuka, TLS, maupun domain.
 *
 * BACA SAJA. Tidak ada perintah yang mengubah keadaan: kalau token bot atau
 * grupnya bocor, yang didapat hanya informasi — bukan kendali atas router produksi.
 */
class TelegramBot
{
    private ?string $botToken;
    private ?string $chatId;

    public function __construct(private readonly VpsMetricsService $metrics)
    {
        // Setting (bisa diubah lewat UI) menimpa .env; .env tetap jadi cadangan.
        $this->botToken = Setting::get('telegram.bot_token', config('backup.telegram.bot_token'));
        $this->chatId   = (string) Setting::get('telegram.chat_id', config('backup.telegram.chat_id'));
    }

    public function isConfigured(): bool
    {
        return (bool) ($this->botToken && $this->chatId);
    }

    /**
     * @return int|null update_id terakhir yang diproses, atau null kalau tidak ada.
     */
    public function poll(?int $offset, int $timeout = 50): ?int
    {
        $res = Http::timeout($timeout + 15)->get(
            "https://api.telegram.org/bot{$this->botToken}/getUpdates",
            array_filter([
                'timeout'         => $timeout,
                'offset'          => $offset,
                'allowed_updates' => json_encode(['message']),
            ], fn ($v) => $v !== null)
        );

        if (! $res->successful()) {
            Log::warning('TelegramBot: getUpdates gagal — ' . $res->status());
            return $offset;
        }

        $last = $offset;
        foreach ($res->json('result', []) as $update) {
            $last = ((int) $update['update_id']) + 1;

            $msg  = $update['message'] ?? null;
            $text = trim((string) ($msg['text'] ?? ''));
            $from = (string) ($msg['chat']['id'] ?? '');

            // Diamkan pesan dari chat lain. Jangan membalas apa pun — membalas
            // saja sudah memberi tahu orang asing bahwa bot ini hidup.
            if ($from !== $this->chatId || $text === '') {
                continue;
            }

            $this->send($this->handle($text));
        }

        return $last;
    }

    /** Mengambil update_id terbaru tanpa memprosesnya, untuk melewati antrian lama. */
    public function skipBacklog(): ?int
    {
        $res = Http::timeout(15)->get(
            "https://api.telegram.org/bot{$this->botToken}/getUpdates",
            ['offset' => -1, 'timeout' => 0]
        );

        $result = $res->successful() ? $res->json('result', []) : [];

        return $result ? ((int) end($result)['update_id']) + 1 : null;
    }

    public function handle(string $text): string
    {
        // "/status@NamaBot arg" -> ["/status", "arg"]
        $parts = preg_split('/\s+/', $text, 2);
        $cmd   = strtolower(explode('@', $parts[0])[0]);
        $arg   = trim($parts[1] ?? '');

        return match ($cmd) {
            '/status', '/start' => $this->status(),
            '/vps'              => $this->vps(),
            '/gagal', '/failed' => $this->gagal(),
            '/node'             => $this->node($arg),
            '/help'             => $this->help(),
            default             => "Perintah tidak dikenal.\n\n" . $this->help(),
        };
    }

    // ── Perintah ─────────────────────────────────────────────────────────────

    private function status(): string
    {
        $nodes = Node::with('latestBackupLog')->get();

        $gagal   = $nodes->filter(fn ($n) => $n->latestBackupLog?->status === 'failed');
        $sukses  = $nodes->filter(fn ($n) => $n->latestBackupLog?->status === 'success')->count();
        $jalan   = $nodes->filter(fn ($n) => in_array($n->latestBackupLog?->status, ['running', 'pending'], true))->count();
        $belum   = $nodes->filter(fn ($n) => $n->latestBackupLog === null)->count();

        $out = "📊 *PerwiraBackup* · " . $this->waktu(now()) . "\n\n"
             . "Node: *{$nodes->count()}* total\n"
             . "✅ {$sukses} sukses · ❌ {$gagal->count()} gagal";
        if ($jalan)  { $out .= " · ⏳ {$jalan} berjalan"; }
        if ($belum)  { $out .= " · ⚪ {$belum} belum pernah"; }

        $out .= "\n\n" . $this->ringkasVps();

        if ($gagal->isNotEmpty()) {
            $nama = $gagal->pluck('name')->implode(', ');
            $out .= "\n\n❌ Gagal: `{$nama}`\n→ /gagal untuk alasannya";
        }

        return $out;
    }

    private function vps(): string
    {
        $m = $this->metrics->getLatest();
        if (! $m) {
            return "💻 Belum ada data metrik VPS.\nKolektor berjalan tiap menit — coba lagi sebentar lagi.";
        }

        $ramPct  = $m->memory_total_mb > 0 ? round($m->memory_used_mb / $m->memory_total_mb * 100) : 0;
        $diskPct = $m->disk_total_gb  > 0 ? round($m->disk_used_gb  / $m->disk_total_gb  * 100) : 0;

        return "💻 *VPS backup* · " . $this->waktu($m->recorded_at) . "\n\n"
             . "```\n"
             . sprintf("CPU    %s%%\n", $m->cpu_usage_percent)
             . sprintf("RAM    %.1f / %.1f GB  (%d%%)\n", $m->memory_used_mb / 1024, $m->memory_total_mb / 1024, $ramPct)
             . sprintf("Disk   %.1f / %.1f GB  (%d%%)\n", $m->disk_used_gb, $m->disk_total_gb, $diskPct)
             . sprintf("Load   %s\n", $m->load_average)
             . "```\n"
             . "_Disk = partisi tempat backup disimpan._";
    }

    private function gagal(): string
    {
        $nodes = Node::with('latestBackupLog')->get()
            ->filter(fn ($n) => $n->latestBackupLog?->status === 'failed')
            ->values();

        if ($nodes->isEmpty()) {
            return "✅ Tidak ada node yang gagal saat ini.";
        }

        $out = "❌ *{$nodes->count()} node gagal*\n";

        foreach ($nodes as $i => $n) {
            $log = $n->latestBackupLog;
            $out .= "\n" . ($i + 1) . ". `{$n->name}` · {$n->type} · {$n->host}\n"
                  . "   gagal " . $this->waktu($log->created_at) . $this->lalu($log->created_at) . "\n"
                  . '   ' . $this->suksesTerakhir($n) . "\n"
                  . "   `" . $this->potong($log->error_message) . "`\n";
        }

        return $out;
    }

    private function node(string $nama): string
    {
        if ($nama === '') {
            return "Sebutkan nama node-nya, mis:\n`/node rb-core-pop1`";
        }

        $n = Node::with(['latestBackupLog', 'schedule'])->where('name', $nama)->first();
        if (! $n) {
            $mirip = Node::where('name', 'like', '%' . $nama . '%')->pluck('name')->take(5);
            return "Node `{$nama}` tidak ditemukan."
                 . ($mirip->isNotEmpty() ? "\n\nMaksud Anda: `" . $mirip->implode('`, `') . "`" : '');
        }

        $log  = $n->latestBackupLog;
        $ikon = match ($log?->status) {
            'success'            => '✅',
            'failed'             => '❌',
            'running', 'pending' => '⏳',
            default              => '⚪',
        };

        $out = "🔧 *{$n->name}* · {$n->type}\n\n"
             . "Host     `{$n->host}:{$n->port}`\n"
             . "Jadwal   tiap {$n->schedule_interval_hours} jam\n";

        if ($n->schedule?->next_run_at) {
            $out .= "Berikut  " . $this->waktu($n->schedule->next_run_at) . "\n";
        }
        if (! $n->is_active) {
            $out .= "⚠️ Node ini _nonaktif_ — tidak dijadwalkan.\n";
        }

        $out .= "\nStatus   {$ikon} " . ($log?->status ?? 'belum pernah dijalankan');
        if ($log) {
            $out .= " · " . $this->waktu($log->created_at) . $this->lalu($log->created_at);
        }
        $out .= "\n         " . $this->suksesTerakhir($n);   // sejajar kolom label

        if ($log?->status === 'failed' && $log->error_message) {
            $out .= "\n\nError:\n`" . $this->potong($log->error_message, 500) . "`";
        }

        return $out;
    }

    private function help(): string
    {
        return "*Perintah yang tersedia*\n\n"
             . "/status — ringkasan armada + kapasitas VPS\n"
             . "/gagal — node yang gagal beserta alasannya\n"
             . "/vps — kapasitas VPS backup\n"
             . "/node `<nama>` — detail satu node\n"
             . "/help — pesan ini\n\n"
             . "_Bot ini hanya membaca; tidak ada perintah yang mengubah apa pun._";
    }

    // ── Pembantu ─────────────────────────────────────────────────────────────

    private function ringkasVps(): string
    {
        $m = $this->metrics->getLatest();
        if (! $m) {
            return "💻 VPS: _belum ada data metrik_";
        }

        $ramPct  = $m->memory_total_mb > 0 ? round($m->memory_used_mb / $m->memory_total_mb * 100) : 0;
        $diskPct = $m->disk_total_gb  > 0 ? round($m->disk_used_gb  / $m->disk_total_gb  * 100) : 0;

        return "💻 *VPS backup*\n"
             . sprintf(
                 "CPU %s%% · RAM %.1f/%.1f GB (%d%%)\nDisk %.1f/%.1f GB (%d%%) · load %s",
                 $m->cpu_usage_percent,
                 $m->memory_used_mb / 1024, $m->memory_total_mb / 1024, $ramPct,
                 $m->disk_used_gb, $m->disk_total_gb, $diskPct,
                 $m->load_average
             );
    }

    /**
     * Umur backup baik terakhir. Ditampilkan berdampingan dengan waktu gagal karena
     * "gagal 3 jam lalu tapi backup baik terakhir 3 hari lalu" jauh lebih genting
     * daripada "gagal sekali tadi malam".
     */
    private function suksesTerakhir(Node $n): string
    {
        return $n->last_backup_at
            ? 'sukses terakhir ' . $this->waktu($n->last_backup_at) . $this->lalu($n->last_backup_at)
            : '⚠️ belum pernah sukses';
    }

    private function waktu(Carbon|string|null $t): string
    {
        if (! $t) return '-';
        $c = $t instanceof Carbon ? $t->copy() : Carbon::parse($t);

        return $c->setTimezone(config('backup.timezone', 'Asia/Jakarta'))
            ->locale('id')
            ->translatedFormat('d M H:i') . ' WIB';
    }

    private function lalu(Carbon|string|null $t): string
    {
        if (! $t) return '';
        $c = $t instanceof Carbon ? $t->copy() : Carbon::parse($t);

        return ' (' . $c->locale('id')->diffForHumans(null, true) . ' lalu)';
    }

    private function potong(?string $s, int $max = 220): string
    {
        $s = trim((string) $s);
        if ($s === '') return '(tanpa pesan error)';
        // Backtick akan merusak blok kode Markdown Telegram.
        $s = str_replace('`', "'", $s);

        return mb_strlen($s) > $max ? mb_substr($s, 0, $max) . '…' : $s;
    }

    private function send(string $message): void
    {
        try {
            Http::timeout(10)->post(
                "https://api.telegram.org/bot{$this->botToken}/sendMessage",
                ['chat_id' => $this->chatId, 'text' => $message, 'parse_mode' => 'Markdown'],
            );
        } catch (\Exception $e) {
            Log::error('TelegramBot: gagal mengirim balasan — ' . $e->getMessage());
        }
    }
}
