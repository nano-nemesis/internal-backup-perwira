<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Validation\ValidationException;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    protected function unauthenticated($request, AuthenticationException $exception)
    {
        if ($request->expectsJson()) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        // Aplikasi ini TIDAK punya route bernama 'login' — route('login') melempar
        // RouteNotFoundException dan menghasilkan 500, bukan pengalihan. Terjadi nyata
        // saat sesi habis lalu tombol Download diklik: itu navigasi browser biasa
        // (<a href="/api/...">) yang tidak meminta JSON. '/login' adalah rute SPA.
        return redirect()->guest('/login');
    }

    protected function invalidJson($request, ValidationException $exception)
    {
        return response()->json([
            'message' => 'Validation failed',
            'errors' => $exception->errors(),
        ], $exception->status);
    }
}
