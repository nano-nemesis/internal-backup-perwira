<?php
namespace App\Services;

use App\Models\Node;

class MikrotikService
{
    public function backup(Node $node): string
    {
        $now = \Carbon\Carbon::now('Asia/Jakarta');
        $timestamp = $now->format('Y-m-d-H.i') . 'WIB';
        $nodeName = strtolower(preg_replace('/[^a-zA-Z0-9\-_]/', '-', $node->name));
        $filename = "backup-{$nodeName}-{$timestamp}.rsc";

        $localDir = storage_path("app/backups/mikrotik/{$node->name}");
        if (!is_dir($localDir)) {
            mkdir($localDir, 0755, true);
        }
        $localPath = "{$localDir}/{$filename}";

        $content = $this->runSshCommand($node, '/export');

        if (empty(trim($content))) {
            throw new \RuntimeException(
                "Output /export kosong dari {$node->host}. " .
                "Pastikan user SSH memiliki policy 'read' di MikroTik."
            );
        }

        file_put_contents($localPath, $content);

        if (!file_exists($localPath) || filesize($localPath) === 0) {
            throw new \RuntimeException("Gagal menyimpan file backup dari {$node->host}");
        }

        return $localPath;
    }

    public function execute(Node $node, string $command): string
    {
        return $this->runSshCommand($node, $command);
    }

    /**
     * Kirim command SSH ke MikroTik via proc_open sebagai argument (bukan heredoc).
     * spatie/ssh selalu wrap command dalam heredoc (<< \EOF-SPATIE-SSH) yang tidak
     * didukung MikroTik RouterOS 6.x, sehingga output selalu kosong.
     */
    private function runSshCommand(Node $node, string $command): string
    {
        $timeout = config('backup.ssh_timeout', 30);
        $host = $node->host;
        $port = $node->port ?? 22;
        $user = $node->ssh_user;

        $baseOptions = sprintf(
            '-p %d -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=%d -o BatchMode=no',
            $port,
            $timeout
        );

        if ($node->ssh_key_path && file_exists($node->ssh_key_path)) {
            $sshCmd = sprintf(
                'ssh -i %s %s %s@%s %s',
                escapeshellarg($node->ssh_key_path),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($command)
            );
        } else {
            $password = $node->ssh_password ?? '';
            $sshCmd = sprintf(
                'sshpass -p %s ssh %s -o PasswordAuthentication=yes %s@%s %s',
                escapeshellarg($password),
                $baseOptions,
                escapeshellarg($user),
                escapeshellarg($host),
                escapeshellarg($command)
            );
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $process = proc_open($sshCmd, $descriptors, $pipes);

        if (!is_resource($process)) {
            throw new \RuntimeException("Gagal membuka proses SSH ke {$host}");
        }

        fclose($pipes[0]);

        $output = stream_get_contents($pipes[1]);
        $error  = stream_get_contents($pipes[2]);

        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($process);

        if ($exitCode !== 0 && empty(trim($output))) {
            throw new \RuntimeException(
                "SSH command gagal ke {$host} (exit code {$exitCode}): " . trim($error)
            );
        }

        return $output;
    }
}
