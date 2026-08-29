<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => User::select('id', 'username', 'email', 'role', 'is_active', 'created_at')
                ->orderBy('created_at')
                ->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => 'required|string|min:3|max:50|unique:users',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'required|in:admin,operator,viewer',
        ]);

        $user = User::create([
            'username' => $validated['username'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'is_active' => true,
        ]);

        return response()->json([
            'data' => $user->only('id', 'username', 'email', 'role', 'is_active'),
            'message' => 'User created successfully',
        ], 201);
    }

    public function updateRole(Request $request, string $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $request->validate(['role' => 'required|in:admin,operator,viewer']);

        // Menurunkan admin aktif terakhir mengunci SEMUA orang keluar: /admin/users dan
        // remote execute butuh role admin, jadi tidak ada lagi yang bisa mengembalikannya
        // tanpa mengedit database langsung. destroy() sudah aman karena melarang hapus
        // akun sendiri, tapi jalur ini belum dijaga.
        if ($user->role === 'admin' && $request->role !== 'admin' && $this->isLastActiveAdmin($user)) {
            return response()->json([
                'message' => 'Tidak bisa menurunkan admin aktif terakhir — '
                    . 'angkat admin lain terlebih dahulu.',
            ], 422);
        }

        Log::warning('AUDIT ubah-peran', [
            'user' => $request->user()->username, 'ip' => $request->ip(),
            'target' => $user->username, 'dari' => $user->role, 'ke' => $request->role,
        ]);

        $user->update(['role' => $request->role]);
        return response()->json(['data' => $user, 'message' => 'Role updated']);
    }

    private function isLastActiveAdmin(User $user): bool
    {
        return User::where('role', 'admin')
            ->where('is_active', true)
            ->where('id', '!=', $user->id)
            ->doesntExist();
    }

    public function resetPassword(Request $request, string $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $request->validate(['password' => 'required|string|min:8']);
        Log::warning('AUDIT reset-password', [
            'user' => $request->user()->username, 'ip' => $request->ip(), 'target' => $user->username,
        ]);

        $user->update(['password' => Hash::make($request->password)]);
        return response()->json(['message' => 'Password reset successfully']);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Cannot delete your own account'], 422);
        }

        Log::warning('AUDIT hapus-user', [
            'user' => $request->user()->username, 'ip' => $request->ip(), 'target' => $user->username,
        ]);

        $user->delete();
        return response()->json(['message' => 'User deleted successfully']);
    }
}
