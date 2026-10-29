<?php

return [
    'default' => env('QUEUE_CONNECTION', 'database'),

    'connections' => [
        'sync' => ['driver' => 'sync'],

        'database' => [
            'driver' => 'database',
            'table' => 'jobs',
            'queue' => 'default',
            // Di atas BackupJob::TIMEOUT_SEMUA_DB (3 jam): kalau lebih pendek, job yang
            // masih berjalan dianggap macet dan bisa diambil worker lain.
            'retry_after' => 3 * 3600 + 300,
            'after_commit' => false,
        ],

        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
            'queue' => env('REDIS_QUEUE', 'default'),
            'retry_after' => 90,
            'block_for' => null,
            'after_commit' => false,
        ],
    ],

    'batching' => [
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => 'job_batches',
    ],

    'failed' => [
        'driver' => env('QUEUE_FAILED_DRIVER', 'database-uuids'),
        'database' => env('DB_CONNECTION', 'mysql'),
        'table' => 'failed_jobs',
    ],
];
