<?php

use Illuminate\Support\Facades\Schedule;

// Sebelumnya di app/Console/Kernel.php, yang tidak ada lagi di Laravel 11+.
// Perintahnya sendiri ditemukan otomatis dari app/Console/Commands.
Schedule::command('backup:run-scheduled')->everyMinute();
Schedule::command('metrics:collect')->everyMinute();
Schedule::command('model:prune', ['--model' => [\App\Models\ActivityLog::class]])->daily();
