<?php

/**
 * PATCH: Node.php model
 *
 * Tambahkan helper isVirtualizorDb() dan update type hint comment.
 * Perubahan sangat minimal — hanya tambah method helper.
 *
 * File: backend/app/Models/Node.php
 */

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Node extends Model
{
    use HasFactory;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'name', 'type', 'host', 'port',
        'ssh_user', 'ssh_password', 'ssh_key_path',
        'db_name', 'db_user', 'db_password',
        'schedule_interval_hours', 'is_active', 'last_backup_at',
    ];

    protected $hidden = ['ssh_password', 'db_password'];

    protected $casts = [
        'is_active'               => 'boolean',
        'last_backup_at'          => 'datetime',
        'port'                    => 'integer',
        'schedule_interval_hours' => 'integer',
    ];

    /**
     * Valid node types:
     *   'mikrotik'       — MikroTik CHR/RouterOS, backup via SSH /export
     *   'database'       — MySQL/MariaDB server, backup via SSH mysqldump
     *   'virtualizor_db' — Virtualizor panel DB backup, pull via SCP dari /var/virtualizor/backup/db
     *                      Note: field db_name digunakan sebagai override path backup dir
     */
    protected static function boot(): void
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = Str::uuid()->toString();
            }
        });
    }

    // ─── Accessors / Mutators ──────────────────────────────────────────────────

    public function setSshPasswordAttribute(?string $value): void
    {
        $this->attributes['ssh_password'] = $value ? encrypt($value) : null;
    }

    public function getSshPasswordAttribute(?string $value): ?string
    {
        if (!$value) return null;
        try { return decrypt($value); } catch (\Exception $e) { return null; }
    }

    public function setDbPasswordAttribute(?string $value): void
    {
        $this->attributes['db_password'] = $value ? encrypt($value) : null;
    }

    public function getDbPasswordAttribute(?string $value): ?string
    {
        if (!$value) return null;
        try { return decrypt($value); } catch (\Exception $e) { return null; }
    }

    // ─── Type Helpers ──────────────────────────────────────────────────────────

    public function isMikrotik(): bool
    {
        return $this->type === 'mikrotik';
    }

    public function isDatabase(): bool
    {
        return $this->type === 'database';
    }

    /** Node ini adalah Virtualizor panel — backup dir via db_name field (opsional) */
    public function isVirtualizorDb(): bool
    {
        return $this->type === 'virtualizor_db';
    }

    // ─── Relationships ─────────────────────────────────────────────────────────

    public function backupLogs(): HasMany
    {
        return $this->hasMany(BackupLog::class, 'node_id');
    }

    public function schedule(): HasOne
    {
        return $this->hasOne(NodeSchedule::class, 'node_id');
    }

    public function latestBackupLog(): HasOne
    {
        return $this->hasOne(BackupLog::class, 'node_id')->latestOfMany('created_at');
    }
}
