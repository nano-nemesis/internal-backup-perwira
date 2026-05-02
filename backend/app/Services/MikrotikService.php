<?php

namespace App\Services;

use App\Models\Node;
use Spatie\Ssh\Ssh;

class MikrotikService
{
    public function backup(Node $node): string
    {
        $timestamp = now()->format('Ymd_His');
        $filename = "{$node->name}_{$timestamp}.rsc";
        $remotePath = "/tmp/{$filename}";
        $localDir = config('backup.storage_path') . "/mikrotik/{$node->name}";

        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$filename}";

        $ssh = $this->buildSsh($node);

        // Export MikroTik config to file
        $ssh->execute("/export file={$remotePath}");
        sleep(2);

        // Download backup file
        $ssh->download($remotePath, $localPath);

        // Remove remote temp file (best effort)
        try {
            $ssh->execute("file remove {$remotePath}");
        } catch (\Exception $e) {
            // ignore cleanup errors
        }

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException("Backup file empty or not found after download from {$node->host}");
        }

        return $localPath;
    }

    public function execute(Node $node, string $command): string
    {
        $ssh = $this->buildSsh($node);
        $result = $ssh->execute($command);
        return is_array($result) ? implode("\n", $result) : (string) $result;
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
