<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        if (User::where('username', 'admin')->exists()) {
            $this->command->info('Admin user already exists, skipping.');
            return;
        }

        User::create([
            'username' => 'admin',
            'email' => 'admin@perwira.local',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        $this->command->info('Admin user created: username=admin, password=password123');
    }
}
