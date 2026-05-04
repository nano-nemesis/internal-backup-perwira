<?php

return [
    'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 7),
    'max_parallel' => (int) env('BACKUP_MAX_PARALLEL', 5),
    'ssh_timeout' => (int) env('SSH_TIMEOUT', 120),
    'timezone' => env('BACKUP_TIMEZONE', 'Asia/Jakarta'),
    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id' => env('TELEGRAM_CHAT_ID'),
    ],
    'alert_cooldown_minutes' => (int) env('ALERT_COOLDOWN_MINUTES', 30),
    'storage_path' => storage_path('app/backups'),
];
