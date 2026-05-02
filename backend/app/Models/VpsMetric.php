<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VpsMetric extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'recorded_at', 'cpu_usage_percent', 'memory_used_mb',
        'memory_total_mb', 'disk_used_gb', 'disk_total_gb', 'load_average',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'cpu_usage_percent' => 'float',
        'load_average' => 'float',
        'disk_used_gb' => 'float',
        'disk_total_gb' => 'float',
        'memory_used_mb' => 'integer',
        'memory_total_mb' => 'integer',
    ];
}
