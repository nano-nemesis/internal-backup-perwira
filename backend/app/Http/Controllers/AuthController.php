<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    public function setupStatus(): JsonResponse
    {
        return response()->json(['has_users' => User::exists()]);
    }

    public function setup(Request $request): JsonResponse
    {
        // Endpoint ini TANPA autentikasi dan membuat akun admin. Di internet publik
        // ia layak dibatasi seperti halaman login, supaya tidak bisa digedor.
        $key = 'setup-attempts:' . $request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json([
                'message' => 'Terlalu banyak percobaan. Coba lagi dalam '
                    . RateLimiter::availableIn($key) . ' detik.',
            ], 429);
        }
        RateLimiter::hit($key, 900);

        if (User::exists()) {
            return response()->json(['message' => 'Setup already completed'], 409);
        }

        $validated = $request->validate([
            'username' => 'required|string|min:3|max:50',
            'email' => 'required|email',
            'password' => ['required', 'string', self::aturanPassword()],
        ]);

        $user = User::create([
            'username' => $validated['username'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => 'admin',
            'is_active' => true,
        ]);

        ActivityLog::info('auth', 'setup', "Setup awal selesai: akun admin pertama '{$user->username}' dibuat.", [
            'username' => $user->username,
        ]);

        return response()->json([
            'data' => ['username' => $user->username],
            'message' => 'Setup complete. You can now login.',
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $key = 'login-attempts:' . $request->ip();

        if (RateLimiter::tooManyAttempts($key, 5)) {
            $seconds = RateLimiter::availableIn($key);
            ActivityLog::warning('auth', 'login.diblokir', "Login dari IP ini diblokir sementara ({$seconds} detik lagi) karena 5x gagal berturut-turut.", [
                'username' => (string) $request->input('username'),
            ]);
            return response()->json([
                'message' => "Too many login attempts. Please try again in {$seconds} seconds.",
            ], 429);
        }

        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $request->username)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($key, 300);
            $sisa = RateLimiter::remaining($key, 5);
            ActivityLog::warning('auth', 'login.gagal', $user
                ? "Login gagal untuk '{$user->username}': password salah. Sisa {$sisa} percobaan sebelum IP diblokir 5 menit."
                : "Login gagal: username '{$request->username}' tidak terdaftar. Sisa {$sisa} percobaan sebelum IP diblokir 5 menit.", [
                'username' => (string) $request->username,
                'sebab'    => $user ? 'password salah' : 'username tidak ada',
            ]);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (!$user->is_active) {
            ActivityLog::warning('auth', 'login.nonaktif', "Login ditolak untuk '{$user->username}': akun sedang dinonaktifkan.", [
                'username' => $user->username,
            ]);
            return response()->json(['message' => 'Account is deactivated'], 403);
        }

        RateLimiter::clear($key);

        $request->session()->regenerate();
        Auth::login($user);

        ActivityLog::info('auth', 'login.berhasil', "'{$user->username}' ({$user->role}) berhasil login.", [
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'message' => 'Login successful',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        // Dicatat SEBELUM logout, selagi user & sesinya masih dikenali.
        ActivityLog::info('auth', 'logout', "'{$request->user()->username}' logout.");
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out successfully']);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'role' => $user->role,
                'is_active' => $user->is_active,
            ],
        ]);
    }
}
