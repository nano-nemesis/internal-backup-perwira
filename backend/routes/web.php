<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any}', function () {
    // config(), BUKAN env(): setelah `php artisan config:cache` — langkah baku
    // optimasi produksi — env() di luar berkas config mengembalikan null, sehingga
    // path-nya jadi salah dan rute ini selalu menjawab 503.
    $indexPath = base_path(config('backup.frontend_dir') . '/index.html');

    if (file_exists($indexPath)) {
        return response()->file($indexPath);
    }

    return response()->json(['message' => 'Frontend not built. Run: cd frontend && npm run build'], 503);
})->where('any', '^(?!api|sanctum).*$');
