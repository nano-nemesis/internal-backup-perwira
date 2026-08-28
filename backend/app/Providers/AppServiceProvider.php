<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Ensure backup storage directories exist
        foreach ([
            storage_path('app/backups/mikrotik'),
            storage_path('app/backups/database'),
            storage_path('app/backups/virtualizor'),
        ] as $dir) {
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
        }

        // Pemeriksaan `which sshpass` dihapus dari sini: boot() jalan di SETIAP request
        // dan SETIAP perintah artisan, jadi itu memunculkan subproses per request plus
        // banjir warning di log. Kalau sshpass memang tidak ada, SSH keluar dengan exit
        // code 127 dan MikrotikService melempar error berisi stderr-nya — jelas dan
        // tepat di titik pemakaian.

        // 30 remote-execute calls per minute per authenticated user
        RateLimiter::for('remote-execute', function (Request $request) {
            return Limit::perMinute(30)
                ->by($request->user()?->id ?? $request->ip());
        });

        // 5 manual backup triggers per minute per node per user
        RateLimiter::for('backup-trigger', function (Request $request) {
            $nodeId = $request->route('id') ?? 'unknown';
            return Limit::perMinute(5)
                ->by($nodeId . '|' . ($request->user()?->id ?? $request->ip()));
        });
    }
}
