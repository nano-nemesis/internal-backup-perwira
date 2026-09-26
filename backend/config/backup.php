<?php

return [
    'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 7),
    // Umur maksimal baris di halaman Log Sistem; lebih tua dari ini dipangkas harian.
    'activity_log_retention_days' => (int) env('ACTIVITY_LOG_RETENTION_DAYS', 90),
    'ssh_timeout' => (int) env('SSH_TIMEOUT', 120),
    'timezone' => env('BACKUP_TIMEZONE', 'Asia/Jakarta'),
    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
    ],
    'alert_cooldown_minutes' => (int) env('ALERT_COOLDOWN_MINUTES', 30),
    'storage_path' => storage_path('app/backups'),
    'frontend_dir' => env('FRONTEND_DIR', '../frontend/dist'),
];
