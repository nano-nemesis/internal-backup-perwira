<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\NodeController;
use App\Http\Controllers\VpsMetricsController;
use App\Http\Controllers\Admin\NodeController as AdminNodeController;
use App\Http\Controllers\Admin\UserController;
use Illuminate\Support\Facades\Route;

// Setup (no auth required)
Route::get('/setup/status', [AuthController::class, 'setupStatus']);
Route::post('/setup', [AuthController::class, 'setup']);

// Login (no auth required)
Route::post('/login', [AuthController::class, 'login']);

// Protected routes
Route::middleware(['auth:sanctum', 'active'])->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Nodes (read-only for viewer, backup for operator+)
    Route::get('/nodes', [NodeController::class, 'index']);
    Route::get('/nodes/{id}', [NodeController::class, 'show']);
    Route::get('/nodes/{id}/download/{filename}', [NodeController::class, 'downloadBackup']);

    Route::middleware('role:admin,operator')->group(function () {
        Route::post('/nodes/{id}/backup', [NodeController::class, 'triggerBackup']);
    });

    Route::middleware('role:admin')->group(function () {
        Route::post('/nodes/{id}/execute', [NodeController::class, 'remoteExecute']);
    });

    // VPS Metrics
    Route::get('/vps-metrics', [VpsMetricsController::class, 'index']);

    // Admin: Node Management
    Route::middleware('role:admin,operator')->group(function () {
        Route::get('/admin/nodes', [AdminNodeController::class, 'index']);
        Route::post('/admin/nodes', [AdminNodeController::class, 'store']);
        Route::get('/admin/nodes/{id}', [AdminNodeController::class, 'show']);
        Route::put('/admin/nodes/{id}', [AdminNodeController::class, 'update']);
        Route::delete('/admin/nodes/{id}', [AdminNodeController::class, 'destroy']);
        Route::patch('/admin/nodes/{id}/toggle', [AdminNodeController::class, 'toggle']);
    });

    // Admin: User Management
    Route::middleware('role:admin')->group(function () {
        Route::get('/admin/users', [UserController::class, 'index']);
        Route::post('/admin/users', [UserController::class, 'store']);
        Route::patch('/admin/users/{id}/role', [UserController::class, 'updateRole']);
        Route::patch('/admin/users/{id}/password', [UserController::class, 'resetPassword']);
        Route::delete('/admin/users/{id}', [UserController::class, 'destroy']);
    });
});
