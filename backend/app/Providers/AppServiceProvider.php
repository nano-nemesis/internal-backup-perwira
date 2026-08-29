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
        // Direktori backup TIDAK dibuat di sini.
        //
        // boot() ikut berjalan saat `composer install` dan `artisan migrate` dijalankan
        // sebagai root di VPS, sehingga storage/app/backups/* jadi milik root. Queue
        // worker berjalan sebagai www-data dan kemudian gagal membuat subfolder node
        // di dalamnya: "mkdir(): Permission denied".
        //
        // Tiap service sudah membuat direktorinya sendiri saat backup pertama berjalan —
        // sebagai www-data, jadi kepemilikannya otomatis benar.

        // Pemeriksaan `which sshpass` dihapus dari sini: boot() jalan di SETIAP request
        // dan SETIAP perintah artisan, jadi itu memunculkan subproses per request plus
        // banjir warning di log. Kalau sshpass memang tidak ada, SSH keluar dengan exit
        // code 127 dan MikrotikService melempar error berisi stderr-nya — jelas dan
        // tepat di titik pemakaian.

        // Limiter 'api' dipakai grup middleware api (throttleApi()). Dulu didefinisikan
        // di RouteServiceProvider, yang tidak ada lagi di Laravel 11+ — tanpa ini SETIAP
        // request /api gagal 500 "Rate limiter [api] is not defined".
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

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
