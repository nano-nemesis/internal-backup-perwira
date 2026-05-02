<?php

use Illuminate\Support\Facades\Route;

Route::get('/{any}', function () {
    $frontendDir = env('FRONTEND_DIR', '../frontend/dist');
    $indexPath = base_path($frontendDir . '/index.html');

    if (file_exists($indexPath)) {
        return response()->file($indexPath);
    }

    return response()->json(['message' => 'Frontend not built. Run: cd frontend && npm run build'], 503);
})->where('any', '^(?!api|sanctum).*$');
