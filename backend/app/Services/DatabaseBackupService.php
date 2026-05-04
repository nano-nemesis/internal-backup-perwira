<?php

namespace App\Services;

use App\Models\Node;
use Spatie\Ssh\Ssh;

/**
 * DatabaseBackupService — Backup MySQL/MariaDB via SSH stdout
 *
 * Permission yang dibutuhkan di target server:
 *
 * 1. User SSH (minimal):
 *    - Bisa login via SSH
 *    - Bisa menjalankan `mysqldump` (harus ada di PATH, biasanya via mysql-client)
 *    - TIDAK perlu sudo atau root
 *
 * 2. User MySQL (minimal):
 *    CREATE USER 'backup_user'@'localhost' IDENTIFIED BY 'password';
 *    GRANT SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER ON dbname.* TO 'backup_user'@'localhost';
 *    FLUSH PRIVILEGES;
 *
 * 3. Pastikan mysqldump terinstall di target server:
 *    apt install mysql-client   (Ubuntu/Debian)
 *    yum install mysql          (CentOS/RHEL)
 *
 * Flow backup:
 *   SSH → mysqldump (plain SQL stdout) → capture di VPS backup → gzip lokal → simpan .sql.gz
 *
 * Mengapa tidak pipe ke gzip via SSH?
 *   Output binary dari gzip tidak bisa di-capture via SSH stdout sebagai string — file akan corrupt.
 *   Solusi: capture SQL (text) lalu compress di VPS backup menggunakan PHP native gzip.
 */
class DatabaseBackupService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.sql.gz";

        $localDir = storage_path("app/backups/database/{$node->name}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$filename}";

        $ssh = $this->buildSsh($node);

        // Plain SQL output — no pipe to gzip so stdout stays as text, safe to capture
        // $node->db_password already decrypted by the model accessor
        $dbPass = $node->db_password
            ? "-p'" . addslashes($node->db_password) . "'"
            : '';

        $cmd = "mysqldump --single-transaction --quick --lock-tables=false"
             . " -u{$node->db_user} {$dbPass} {$node->db_name}";

        // removeBash() prevents bash-wrapper overhead; command has no shell features
        $process = $ssh->removeBash()->execute($cmd);
        $content = $process->getOutput();

        if (empty(trim($content))) {
            $err = trim($process->getErrorOutput());
            throw new \RuntimeException(
                "mysqldump output kosong dari {$node->host}." .
                ($err ? " Error: {$err}" : " Pastikan credential DB benar dan user memiliki permission SELECT.")
            );
        }

        // Sanity-check: output harus berisi header mysqldump yang dikenal
        if (!str_contains($content, '-- MySQL dump') && !str_contains($content, '-- MariaDB dump')) {
            $err = trim($process->getErrorOutput());
            throw new \RuntimeException(
                "Output bukan SQL dump yang valid dari {$node->host}." .
                ($err ? " Error: {$err}" : " Cek credential dan nama database.")
            );
        }

        // Compress menggunakan PHP native gzip — tidak butuh binary gzip di VPS
        $gz = gzopen($localPath, 'wb9');
        if ($gz === false) {
            throw new \RuntimeException("Gagal membuka file gzip untuk ditulis: {$localPath}");
        }
        gzwrite($gz, $content);
        gzclose($gz);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException(
                "Gagal membuat file backup database untuk {$node->db_name}@{$node->host}"
            );
        }

        return $localPath;
    }

    private function buildSsh(Node $node): Ssh
    {
        // Database dump butuh lebih banyak waktu dari MikroTik /export
        $timeout = config('backup.ssh_timeout', 120);

        $ssh = Ssh::create($node->ssh_user, $node->host, $node->port ?? 22)
            ->disableStrictHostKeyChecking()
            ->setTimeout($timeout);

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            return $ssh->usePrivateKey($node->ssh_key_path);
        }

        // $node->ssh_password already decrypted by the model accessor
        return $ssh->usePassword($node->ssh_password ?? '');
    }
}
