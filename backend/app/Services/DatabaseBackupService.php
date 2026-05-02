<?php

namespace App\Services;

use App\Models\Node;
use Spatie\Ssh\Ssh;

class DatabaseBackupService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.sql.gz";
        $localDir = config('backup.storage_path') . "/database/{$node->name}";

        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$filename}";

        $ssh = $this->buildSsh($node);

        // Build mysqldump command
        $dbPass = $node->db_password
            ? "-p'" . addslashes($node->db_password) . "'"
            : '';
        $cmd = "mysqldump -u{$node->db_user} {$dbPass} {$node->db_name} | gzip";

        $result = $ssh->execute($cmd);

        // Write output to local file
        $content = is_array($result) ? implode("\n", $result) : (string) $result;
        file_put_contents($localPath, $content);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException("Database backup file empty or not created for {$node->db_name}@{$node->host}");
        }

        return $localPath;
    }

    private function buildSsh(Node $node): Ssh
    {
        $timeout = config('backup.ssh_timeout', 30);

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            return Ssh::create($node->ssh_user, $node->host, $node->port ?? 22)
                ->usePrivateKey($node->ssh_key_path)
                ->disableStrictHostKeyChecking()
                ->setTimeout($timeout);
        }

        return Ssh::create($node->ssh_user, $node->host, $node->port ?? 22)
            ->usePassword($node->ssh_password ?? '')
            ->disableStrictHostKeyChecking()
            ->setTimeout($timeout);
    }
}
