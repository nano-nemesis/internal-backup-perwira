<?php

namespace App\Services;

use App\Models\Node;
use Spatie\Ssh\Ssh;

/**
 * MikrotikService — Backup via SSH stdout capture
 *
 * Permission yang dibutuhkan untuk user SSH di MikroTik:
 * - Group policy: ssh + read (TIDAK perlu write, ftp, atau policy lainnya)
 *
 * Setup di MikroTik:
 * /user group add name=backup-group policy=ssh,read
 * /user add name=backup password=<password> group=backup-group
 *
 * Cara kerja: sistem menjalankan '/export' via SSH dan menangkap
 * output langsung dari stdout tanpa menyimpan file di MikroTik.
 */
class MikrotikService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.rsc";
        $localDir = config('backup.storage_path') . "/mikrotik/{$node->name}";

        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }

        $localPath = "{$localDir}/{$filename}";

        $ssh = $this->buildSsh($node);

        // Capture /export output directly from stdout — tidak perlu write ke filesystem MikroTik
        // User hanya butuh permission: ssh + read
        $output = $ssh->execute('/export');

        $content = is_array($output) ? implode("\n", $output) : (string) $output;

        if (empty(trim($content))) {
            throw new \RuntimeException(
                "Output /export kosong dari {$node->host}. " .
                "Pastikan user SSH memiliki permission 'read' di MikroTik."
            );
        }

        file_put_contents($localPath, $content);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException(
                "Gagal menyimpan file backup dari {$node->host}"
            );
        }

        return $localPath;
    }

    public function execute(Node $node, string $command): string
    {
        $ssh = $this->buildSsh($node);

        try {
            $result = $ssh->execute($command);
            return is_array($result) ? implode("\n", $result) : (string) $result;
        } catch (\Exception $e) {
            throw new \RuntimeException(
                "Gagal eksekusi command di {$node->host}: " . $e->getMessage()
            );
        }
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
