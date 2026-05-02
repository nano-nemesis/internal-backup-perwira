<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NodeSchedule extends Model
{
    public $timestamps = false;

    protected $fillable = ['node_id', 'next_run_at', 'last_run_at', 'interval_hours'];

    protected $casts = [
        'next_run_at' => 'datetime',
        'last_run_at' => 'datetime',
        'interval_hours' => 'integer',
    ];

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'node_id');
    }
}
