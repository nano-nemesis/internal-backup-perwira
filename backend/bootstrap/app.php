<?php

use App\Http\Middleware\CheckRole;
use App\Http\Middleware\EnsureUserIsActive;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Urutan grup `api` dipertahankan persis seperti sebelumnya:
        //   1. Sanctum (menjadikan request dari domain stateful memakai sesi cookie)
        //   2. throttle:api
        //   3. SubstituteBindings
        // throttleApi() dipanggil DULU, baru Sanctum di-prepend, supaya Sanctum berada
        // paling depan. Kalau terbalik, limiter 'api' berjalan sebelum pengguna dikenali
        // sehingga pembatasan jatuh ke IP, bukan per-user.
        $middleware->throttleApi();
        $middleware->api(prepend: [
            EnsureFrontendRequestsAreStateful::class,
        ]);

        $middleware->alias([
            'role'   => CheckRole::class,
            'active' => EnsureUserIsActive::class,
        ]);

        // Aplikasi ini TIDAK punya route bernama 'login'; '/login' adalah rute SPA.
        // Tanpa ini, sesi yang habis pada navigasi non-JSON (mis. tombol Download yang
        // memakai <a href="/api/...">) menghasilkan 500, bukan pengalihan.
        $middleware->redirectGuestsTo('/login');

        // TrustProxies sengaja tidak dipasang: nginx meneruskan ke php-fpm lewat
        // fastcgi_params yang sudah mengisi REMOTE_ADDR dengan IP klien asli, jadi
        // $request->ip() (dipakai rate limit login) sudah benar tanpa itu.
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->dontFlash([
            'current_password',
            'password',
            'password_confirmation',
        ]);

        // Error tak tertangani (HTTP 500, crash command/worker) ikut masuk Log Sistem.
        // Validasi/404/403/sesi habis tidak sampai ke sini — Laravel tidak me-report-nya.
        // Pelaporan bawaan ke laravel.log tetap berjalan (callback tidak menghentikannya).
        $exceptions->report(function (\Throwable $e) {
            $req = app()->runningInConsole() ? null : request();
            \App\Models\ActivityLog::error('sistem', 'error',
                ($req ? "Error server saat {$req->method()} /{$req->path()}: " : 'Error di proses latar belakang: ')
                . $e->getMessage(),
                [
                    'exception' => get_class($e),
                    'lokasi'    => str_replace(base_path() . '/', '', $e->getFile()) . ':' . $e->getLine(),
                    'perintah'  => $req ? null : implode(' ', array_slice($_SERVER['argv'] ?? [], 1)),
                    'trace'     => array_slice(explode("\n", $e->getTraceAsString()), 0, 8),
                ]);
        });

        // Bentuk respons validasi dipertahankan seperti sebelumnya: frontend membaca
        // `errors` lebih dulu, lalu `message`.
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->expectsJson()) {
                return null;
            }

            return response()->json([
                'message' => 'Validation failed',
                'errors'  => $e->errors(),
            ], $e->status);
        });
    })->create();
